import re
import json
import uuid
import logging
from typing import AsyncGenerator, Dict, Any, List, Optional
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.user import User
from app.schemas.chat import ChatStreamRequest
from app.services.llm_service import LLMService, SYSTEM_PROMPT_TEMPLATE
from app.services.agent_tools import ToolDispatcher

logger = logging.getLogger("agent_runtime")

REACT_SYSTEM_PROMPT = """You are QuickDesk AI, an intelligent agent equipped with tools to answer user questions about documents.

Available Tools:
{tools_description}

Response Format Rules:
When you need to look up information from the indexed documents, you MUST output ONLY ONE Thought and ONE Action, then STOP immediately:
Thought: <what information is needed>
Action: <tool_name>
Action Input: {{"query": "<search query>", "document_ids": null}}

STOP your turn after Action Input. DO NOT invent or hallucinate the Observation. The system will provide the real Observation.

When you receive the Observation from the system, you may reason further and take another action, OR provide the final answer:
Thought: I now have enough information to answer the user's question.
Final Answer: <your full, helpful, accurate answer>

CRITICAL CITATION RULES FOR FINAL ANSWER:
1. Every factual sentence or claim MUST end with an inline citation tag: `[doc:CHUNK_ID]`.
2. Extract the exact CHUNK_ID from the chunk header in the observation excerpts: `--- Chunk X [ID: CHUNK_ID] from [FILENAME] ---`.
3. Never invent chunk IDs. Only cite chunk IDs present in the observations.
4. If multiple chunks support a claim, append each: `[doc:CHUNK_ID_1][doc:CHUNK_ID_2]`.
5. If the documents do not contain the answer after searching, state that clearly.
"""


class AgentRuntime:
    """
    ReAct (Reasoning + Acting) Agent execution loop.
    Iteratively determines thoughts, invokes tools via ToolDispatcher,
    records observations in scratchpad memory, and streams events over SSE.
    """

    def __init__(self, max_iterations: int = 4):
        self.max_iterations = max_iterations
        self.dispatcher = ToolDispatcher()

    async def run_agent_loop(
        self,
        req: ChatStreamRequest,
        current_user: User,
        db: AsyncSession,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Executes ReAct cycles, yielding event dictionaries:
        - {"type": "thought", "data": {"thought": ..., "iteration": i}}
        - {"type": "tool_call", "data": {"tool": ..., "tool_input": ..., "iteration": i}}
        - {"type": "tool_result", "data": {"tool": ..., "summary": ..., "citations": [...], "iteration": i}}
        - {"type": "context", "data": {"citations": [...]}}
        - {"type": "token", "data": {"delta": ...}}
        - {"type": "done", "data": {"finish_reason": "stop", "total_steps": i}}
        """
        tools_desc = self.dispatcher.get_tools_description()
        system_prompt = REACT_SYSTEM_PROMPT.format(tools_description=tools_desc)

        # Scoped document filter IDs
        target_docs: Optional[List[str]] = None
        if req.document_ids is not None:
            clean = [str(d).strip() for d in req.document_ids if str(d).strip()]
            if clean:
                target_docs = clean
        elif req.document_id:
            s = str(req.document_id).strip()
            if s:
                target_docs = [s]

        # Working scratchpad
        scratchpad = ""
        all_citations: List[Dict[str, Any]] = []
        seen_queries = set()
        llm_service = LLMService.get_instance()

        iteration = 0
        final_answer_reached = False

        while iteration < self.max_iterations and not final_answer_reached:
            iteration += 1

            # Prepare prompt messages for the agent decision step
            agent_messages: List[Dict[str, str]] = [
                {"role": "system", "content": system_prompt}
            ]

            # Append multi-turn history
            if req.messages:
                for prev_msg in req.messages[-4:]:
                    agent_messages.append({
                        "role": prev_msg.role,
                        "content": prev_msg.content
                    })

            # User query + accumulated scratchpad
            user_content = f"Question: {req.query}\n\n{scratchpad}".strip()
            agent_messages.append({"role": "user", "content": user_content})

            # Generate step decision from LLM (accumulate text)
            step_output = ""
            async for token in llm_service.provider.astream(agent_messages, temperature=0.1):
                step_output += token

            step_output = step_output.strip()

            # Parse Thought, Action, Action Input, or Final Answer
            thought_match = re.search(r"Thought:\s*(.*?)(?=\nAction:|\nFinal Answer:|$)", step_output, re.DOTALL)
            thought_text = thought_match.group(1).strip() if thought_match else ""

            # 1. First check if an Action was selected in this step
            action_match = re.search(r"Action:\s*([a-zA-Z0-9_-]+)", step_output)
            action_input_match = re.search(r"Action Input:\s*(\{.*?\}|.*?)(?=\nThought:|\nObservation:|\nFinal Answer:|$)", step_output, re.DOTALL)

            action_name = action_match.group(1).strip() if action_match else None
            action_input_raw = action_input_match.group(1).strip() if action_input_match else "{}"

            # 2. If NO Action, check for Final Answer
            if not action_name and "Final Answer:" in step_output:
                if thought_text:
                    yield {
                        "type": "thought",
                        "data": {"thought": thought_text, "iteration": iteration}
                    }

                # Emit Citations for grounding before streaming final answer tokens
                yield {
                    "type": "context",
                    "data": {
                        "citations": all_citations,
                        "total_chunks": len(all_citations),
                    }
                }

                final_answer_content = step_output.split("Final Answer:", 1)[1].strip()
                final_answer_reached = True

                # Stream out final answer tokens
                for word_token in self._tokenize_stream(final_answer_content):
                    yield {"type": "token", "data": {"delta": word_token}}

                break

            # 3. Fallback if LLM output does not match ReAct format
            if not action_name:
                # If it didn't choose an action on first turn, execute search_knowledge_base default
                if iteration == 1:
                    thought_text = thought_text or f"I need to search the knowledge base for information on: '{req.query}'."
                    action_name = "search_knowledge_base"
                    action_input = {
                        "query": req.query,
                        "document_ids": target_docs,
                        "top_k": req.top_k,
                        "window_size": req.window_size,
                    }
                else:
                    # Treat raw output as final answer
                    if thought_text:
                        yield {
                            "type": "thought",
                            "data": {"thought": thought_text, "iteration": iteration}
                        }
                    yield {
                        "type": "context",
                        "data": {
                            "citations": all_citations,
                            "total_chunks": len(all_citations),
                        }
                    }
                    for word_token in self._tokenize_stream(step_output):
                        yield {"type": "token", "data": {"delta": word_token}}
                    final_answer_reached = True
                    break
                    break
            else:
                # Parse JSON action input safely
                try:
                    action_input = json.loads(action_input_raw)
                except Exception:
                    # Clean single quotes or bare string
                    cleaned = action_input_raw.strip('"\'')
                    action_input = {"query": cleaned}

                # Ensure search defaults and user document scoping are applied
                if "query" not in action_input or not action_input["query"]:
                    action_input["query"] = req.query
                # Always enforce target_docs if the user or session scoped to specific documents
                if target_docs:
                    action_input["document_ids"] = target_docs
                elif "document_ids" not in action_input or action_input["document_ids"] is None:
                    action_input["document_ids"] = None
                action_input["top_k"] = req.top_k
                action_input["window_size"] = req.window_size

            # Emit Thought Event
            if thought_text:
                yield {
                    "type": "thought",
                    "data": {"thought": thought_text, "iteration": iteration}
                }

            # Emit Tool Call Event
            yield {
                "type": "tool_call",
                "data": {
                    "tool": action_name,
                    "tool_input": action_input,
                    "iteration": iteration,
                }
            }

            # Cycle detection guardrail
            query_key = f"{action_name}:{action_input.get('query', '')}"
            if query_key in seen_queries:
                logger.warning(f"ReAct cycle detected on query: {query_key}. Forcing final answer.")
                break
            seen_queries.add(query_key)

            # Execute Tool via Dispatcher
            tool_res = await self.dispatcher.execute_tool(
                name=action_name,
                db=db,
                user_id=current_user.id,
                tool_input=action_input,
            )

            # Collect citations
            res_citations = tool_res.get("citations", [])
            for c in res_citations:
                if not any(x.get("chunk_id") == c.get("chunk_id") for x in all_citations):
                    all_citations.append(c)

            # Emit Tool Result Event
            yield {
                "type": "tool_result",
                "data": {
                    "tool": action_name,
                    "summary": tool_res.get("summary", "Tool executed."),
                    "citations": res_citations,
                    "iteration": iteration,
                }
            }

            # Update Scratchpad Memory
            obs_text = tool_res.get("context_text", tool_res.get("summary", ""))
            scratchpad += f"\nThought: {thought_text}\nAction: {action_name}\nAction Input: {json.dumps(action_input)}\nObservation: {obs_text}\n"

        # ── Synthesis Step if Final Answer was not streamed ─────────────────
        if not final_answer_reached:
            # Emit Context Citations Event
            yield {
                "type": "context",
                "data": {
                    "citations": all_citations,
                    "total_chunks": len(all_citations),
                }
            }

            yield {
                "type": "status",
                "data": {
                    "stage": "generation",
                    "message": "Synthesizing final answer from tool observations..."
                }
            }

            # Build final synthesis prompt
            context_text = scratchpad if scratchpad.strip() else "No relevant context excerpts found."
            synthesis_system = SYSTEM_PROMPT_TEMPLATE.format(context_text=context_text)

            synthesis_messages: List[Dict[str, str]] = [
                {"role": "system", "content": synthesis_system}
            ]
            if req.messages:
                for prev_msg in req.messages[-4:]:
                    synthesis_messages.append({
                        "role": prev_msg.role,
                        "content": prev_msg.content
                    })
            synthesis_messages.append({"role": "user", "content": req.query})

            async for token in llm_service.provider.astream(synthesis_messages, temperature=req.temperature):
                yield {"type": "token", "data": {"delta": token}}
        else:
            # Emit Citations for grounding if final answer was generated
            yield {
                "type": "context",
                "data": {
                    "citations": all_citations,
                    "total_chunks": len(all_citations),
                }
            }

        # Final Done Event
        yield {
            "type": "done",
            "data": {
                "finish_reason": "stop",
                "total_steps": iteration,
            }
        }

    @staticmethod
    def _tokenize_stream(text: str) -> List[str]:
        """Split text into words and spaces to simulate streaming token delivery."""
        tokens = re.findall(r"\S+|\s+", text)
        return tokens if tokens else [text]

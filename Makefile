.PHONY: help up down restart logs logs-backend logs-frontend build-frontend test

help:
	@echo "HiVE Development Commands:"
	@echo "  make up               - Start all Docker containers in background"
	@echo "  make down             - Stop all Docker containers"
	@echo "  make restart          - Restart all Docker containers"
	@echo "  make logs             - Stream logs from all containers"
	@echo "  make logs-backend     - Stream live logs from FastAPI backend"
	@echo "  make logs-frontend    - Stream live logs from Nginx frontend"
	@echo "  make build-frontend   - Recompile frontend and restart container"
	@echo "  make test             - Run backend unit & integration test suite"

up:
	docker compose up -d

down:
	docker compose down

restart:
	docker compose restart

logs:
	docker compose logs -f

logs-backend:
	docker compose logs -f backend

logs-frontend:
	docker compose logs -f frontend

build-frontend:
	docker compose up -d --build frontend

test:
	cd backend && pytest tests/ -v


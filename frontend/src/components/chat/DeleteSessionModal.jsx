import React from 'react'
import ConfirmDeleteModal from '../ConfirmDeleteModal'

export default function DeleteSessionModal({
  session,
  onClose,
  onConfirm,
}) {
  return (
    <ConfirmDeleteModal
      isOpen={Boolean(session)}
      title="Delete conversation?"
      itemName={session?.title}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  )
}

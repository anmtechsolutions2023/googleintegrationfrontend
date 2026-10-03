import React, { useEffect, useState } from 'react'
import CollectPaymentSheet from './CollectPaymentSheet'
import WriteOffDialog from './WriteOffDialog'
import { useCan } from '../../hooks/useCan'
import { SCOPES } from '../../constants'

/**
 * Collect, or write off, the balance on one invoice.
 *
 * Every screen that shows a due mounts this with the invoice it is looking at,
 * and gets the same sheet, the same write-off and the same permissions. Write-off
 * is offered only to admins (useCan folds TENANT_ADMIN in); the server refuses
 * it for anyone else regardless.
 *
 * @param {Object} props
 * @param {Object|null} props.doc - { Id, TransactionNo, GrossAmount, Paid, Due, CustomerName, BranchId, label }
 * @param {'collect'|'writeoff'} [props.start='collect']
 * @param {Function} props.onClose
 * @param {Function} props.onChanged - After a payment or write-off is recorded.
 */
const CollectFlow = ({ doc, start = 'collect', onClose, onChanged }) => {
  const canWriteOff = useCan(SCOPES.TENANT_SUPER_ADMIN)
  const [step, setStep] = useState(start)

  useEffect(() => { setStep(start) }, [doc?.Id, start])

  if (!doc) return null

  const done = (result) => {
    onChanged?.(result)
    onClose()
  }

  if (step === 'writeoff' && canWriteOff) {
    return <WriteOffDialog doc={doc} onClose={onClose} onDone={done} />
  }
  return (
    <CollectPaymentSheet
      doc={doc}
      onClose={onClose}
      onDone={done}
      onWriteOff={canWriteOff ? () => setStep('writeoff') : undefined}
    />
  )
}

export default CollectFlow

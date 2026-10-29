import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../context/LanguageContext';
import './RejectionReasonModal.css';

const QUICK_REASONS = [
  'Ownership document unclear',
  'Photos missing or low quality',
  'Incorrect address',
  'Incomplete description',
  'Price not valid',
];

const RejectionReasonModal = ({
  onClose,
  onSubmit,
  returnFocusRef,
  loading = false,
}) => {
  const { t } = useLanguage();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const dialogRef = useRef(null);
  const textareaRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const loadingRef = useRef(loading);
  onCloseRef.current = onClose;
  loadingRef.current = loading;
  const trimmedReason = reason.trim();
  const isValid = trimmedReason.length >= 10 && trimmedReason.length <= 500;

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    textareaRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !loadingRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusableElements = dialogRef.current?.querySelectorAll(
        'button:not([disabled]), textarea:not([disabled])',
      );
      if (!focusableElements?.length) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      if (returnFocusRef?.current?.isConnected) returnFocusRef.current.focus();
      if (returnFocusRef) returnFocusRef.current = null;
    };
  }, [returnFocusRef]);

  const submit = async (event) => {
    event.preventDefault();
    if (!isValid || loading) return;
    setError('');
    const result = await onSubmit(trimmedReason);
    if (result?.success) {
      onClose();
      return;
    }
    setError(result?.message || t('Unable to reject property.'));
  };

  return createPortal(
    <div
      className="admin-modal-overlay rejection-reason-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="admin-form-modal rejection-reason-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rejection-reason-title"
        aria-describedby="rejection-reason-help"
        tabIndex={-1}
      >
        <div className="admin-modal-header">
          <div>
            <h2 id="rejection-reason-title">{t('Reject property')}</h2>
            <p id="rejection-reason-help">{t('Provide a clear reason so the landlord knows what to fix.')}</p>
          </div>
        </div>

        <form onSubmit={submit}>
          <label className="rejection-reason-label" htmlFor="rejection-reason-input">
            {t('Reason for rejection (required)')}
          </label>
          <textarea
            ref={textareaRef}
            id="rejection-reason-input"
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              setError('');
            }}
            placeholder={t('Explain what the landlord must fix, e.g. the ownership document is unclear.')}
            aria-describedby="rejection-reason-counter rejection-reason-help"
            aria-invalid={Boolean(error) || (trimmedReason.length > 0 && !isValid)}
            rows={5}
          />
          <div className="rejection-reason-counter" id="rejection-reason-counter" aria-live="polite">
            {t('{count}/500 characters (minimum 10)', { count: trimmedReason.length })}
          </div>
          <div className="rejection-reason-quick-picks" aria-label={t('Suggested rejection reasons')}>
            {QUICK_REASONS.map((quickReason) => (
              <button
                type="button"
                key={quickReason}
                disabled={loading}
                onClick={() => {
                  setReason(quickReason);
                  setError('');
                }}
              >
                {t(quickReason)}
              </button>
            ))}
          </div>
          {error && <p className="rejection-reason-error" role="alert">{error}</p>}
          <footer className="admin-form-modal-actions rejection-reason-actions">
            <button type="button" className="admin-btn" disabled={loading} onClick={onClose}>
              {t('Cancel')}
            </button>
            <button type="submit" className="admin-btn admin-btn-reject" disabled={!isValid || loading}>
              {loading ? t('Rejecting...') : t('Reject')}
            </button>
          </footer>
        </form>
      </section>
    </div>,
    document.body,
  );
};

export default RejectionReasonModal;

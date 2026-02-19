import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import Icon from './Icon';
import { useI18n } from '../../i18n';
import './common.css';
import { registerKeydownHandler, KEYDOWN_PRIORITIES } from '../../utils/keyboard';

const isTypingTarget = (target) => {
    if (!target) return false;
    if (target instanceof HTMLInputElement) return true;
    if (target instanceof HTMLTextAreaElement) return true;
    if (target instanceof HTMLSelectElement) return true;

    // contenteditable elements
    if (typeof target.closest === 'function') {
        const editable = target.closest('[contenteditable="true"]');
        if (editable) return true;
    }

    return false;
};

const isNativeClickable = (el) => {
    if (!el || !(el instanceof HTMLElement)) return false;
    const tag = el.tagName;
    if (tag === 'BUTTON' || tag === 'A') return true;
    if (el.getAttribute('role') === 'button') return true;
    return false;
};

/**
 * Modal component
 *
 * Note on keyboard handling:
 * - Escape is handled here so it doesn't fall through to app-level handlers.
 * - Optionally, Enter can trigger a provided `defaultAction` (e.g. Create/Rename) so it
 *   also doesn't fall through to background list navigation.
 */
const Modal = ({
    isOpen,
    onClose,
    title,
    children,
    footer,
    size = 'md',
    showCloseButton = true,
    closeOnOverlayClick = true,
    closeOnEsc = true,
    className = '',
    defaultAction,
    defaultActionEnabled = true,
    consumeEnter,
    closeAriaLabel,
    ...rest
}) => {
    const { t } = useI18n();
    const modalRef = useRef(null);

    // Close modal when Escape key is pressed
    useEffect(() => {
        if (isOpen) {
            // Prevent scrolling of the body when modal is open
            document.body.style.overflow = 'hidden';
        }

        return () => {
            // Restore scrolling when modal is closed
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;

        return registerKeydownHandler(
            (event) => {
                // Allow inner components to "claim" Escape (e.g. close dropdowns first).
                if (event.defaultPrevented) return false;

                if (closeOnEsc && event.key === 'Escape') {
                    // Claim Escape so app-level handlers (clear-selection, etc.) don't run.
                    event.preventDefault();
                    onClose();
                    return true;
                }

                return false;
            },
            {
                id: 'modal-escape',
                name: 'Modal escape',
                priority: KEYDOWN_PRIORITIES.MODAL,
                when: () => isOpen,
            }
        );
    }, [isOpen, onClose, closeOnEsc]);

    // Optional: Enter triggers modal's primary action (Create/Rename/Save)
    useEffect(() => {
        if (!isOpen) return;

        const shouldConsume =
            typeof consumeEnter === 'boolean'
                ? consumeEnter
                : typeof defaultAction === 'function';

        if (!shouldConsume) return;

        return registerKeydownHandler(
            (event) => {
                if (event.defaultPrevented) return false;

                // Let Tab/Shift+Tab work for focus movement.
                if (event.key === 'Tab') return false;

                // Don't steal Enter from form fields; let the form submit normally.
                if (isTypingTarget(event.target)) return false;

                // If focus is already on a button/link in the modal, let native activation run.
                const active = document.activeElement;
                if (modalRef.current && active && modalRef.current.contains(active) && isNativeClickable(active)) {
                    return false;
                }

                if (event.key === 'Enter' || event.key === 'NumpadEnter') {
                    event.preventDefault();

                    if (typeof defaultAction === 'function' && defaultActionEnabled) {
                        defaultAction();
                    }

                    // Even when disabled, consume Enter so it doesn't fall through to the background.
                    return true;
                }

                return false;
            },
            {
                id: 'modal-default-action',
                name: 'Modal default action',
                // Keep under confirm dialogs; above app-level shortcuts.
                priority: KEYDOWN_PRIORITIES.MODAL - 1,
                when: () => isOpen,
            }
        );
    }, [isOpen, defaultAction, defaultActionEnabled, consumeEnter]);

    // Focus the modal when it opens
    useEffect(() => {
        if (isOpen && modalRef.current) {
            // Save the currently focused element
            const previouslyFocused = document.activeElement;

            // Focus the modal (components may move focus to an input afterward)
            modalRef.current.focus();

            // Restore focus when modal closes
            return () => {
                if (previouslyFocused instanceof HTMLElement) {
                    previouslyFocused.focus();
                }
            };
        }
    }, [isOpen]);

    /**
     * Handle clicks on the modal overlay
     * @param {React.MouseEvent} event - Mouse-Event
     */
    const handleOverlayClick = (event) => {
        if (closeOnOverlayClick && modalRef.current && !modalRef.current.contains(event.target)) {
            onClose();
        }
    };

    // Don't render anything if modal is closed
    if (!isOpen) return null;

    // Build class names
    const modalClasses = ['modal', `modal-${size}`, className].filter(Boolean).join(' ');

    // Create portal to render modal at the body level
    return ReactDOM.createPortal(
        <div className="modal-overlay" onClick={handleOverlayClick}>
            <div
                className={modalClasses}
                ref={modalRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-labelledby={title ? 'modal-title' : undefined}
                {...rest}
            >
                {/* Modal Header */}
                {(title || showCloseButton) && (
                    <div className="modal-header">
                        {title && (
                            <h2 className="modal-title" id="modal-title">
                                {title}
                            </h2>
                        )}

                        {showCloseButton && (
                            <button
                                className="modal-close"
                                onClick={onClose}
                                aria-label={closeAriaLabel || t('common.closeModal')}
                            >
                                <Icon name="x" />
                            </button>
                        )}
                    </div>
                )}

                {/* Modal Content */}
                <div className="modal-content">{children}</div>

                {/* Modal Footer */}
                {footer && <div className="modal-footer">{footer}</div>}
            </div>
        </div>,
        document.body
    );
};

export default Modal;

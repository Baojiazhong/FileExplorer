import React, { useState, useRef, useEffect } from 'react';
import './common.css';

/**
 * Tooltip component
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Element to attach tooltip to
 * @param {string} props.text - Tooltip text content
 * @param {string} [props.position='top'] - Tooltip position (top, bottom, left, right)
 * @param {string} [props.className] - Additional CSS class names
 * @param {number} [props.delay=300] - Delay before showing tooltip (ms)
 * @returns {React.ReactElement} Tooltip component
 */
const Tooltip = ({
                     children,
                     text,
                     position = 'top',
                     className = '',
                     delay = 300,
                     ...rest
                 }) => {
    const [isVisible, setIsVisible] = useState(false);
    const timeoutRef = useRef(null);

    useEffect(() => {
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, []);

    const handleMouseEnter = () => {
        timeoutRef.current = setTimeout(() => {
            setIsVisible(true);
        }, delay);
    };

    const handleMouseLeave = () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        setIsVisible(false);
    };

    // Build class name based on props
    const tooltipClasses = [
        'tooltip-content',
        `tooltip-${position}`,
        isVisible ? 'tooltip-visible' : '',
        className
    ].filter(Boolean).join(' ');

    return (
        <div
            className="tooltip"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onFocus={handleMouseEnter}
            onBlur={handleMouseLeave}
            {...rest}
        >
            {children}
            <div
                className={tooltipClasses}
                role="tooltip"
                aria-hidden={!isVisible}
            >
                {text}
            </div>
        </div>
    );
};

export default React.memo(Tooltip);
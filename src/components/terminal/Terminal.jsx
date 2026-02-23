import React, { useState, useRef, useEffect } from 'react';
import { useI18n } from '../../i18n';
import { useHistory } from '../../providers/HistoryProvider';
import { useFileSystem } from '../../providers/FileSystemProvider';
import { useSettings } from '../../providers/SettingsProvider';
import Icon from '../common/Icon';
import useTerminalHistory from './useTerminalHistory';
import useTerminalCommands from './useTerminalCommands';
import './terminal.css';

const Terminal = ({ isOpen, onToggle }) => {
    const { t } = useI18n();
    const [commandHistory, setCommandHistory] = useState([]);
    const [currentCommand, setCurrentCommand] = useState('');
    const [isSearchMode, setIsSearchMode] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [selectedSearchIndex, setSelectedSearchIndex] = useState(-1);
    const inputRef = useRef(null);
    const terminalRef = useRef(null);
    const { currentPath, navigateTo } = useHistory();
    const { setCurrentPath } = useFileSystem();
    const { settings } = useSettings();

    const terminalHeight = settings.terminal_height || 240;

    const history = useTerminalHistory();
    const commands = useTerminalCommands({ currentPath, navigateTo, onToggle, t });

    useEffect(() => {
        if (commandHistory.length === 0) {
            setCommandHistory([{
                type: 'system',
                content: t('terminal.welcome', { path: currentPath || '/' }),
                timestamp: new Date().toLocaleTimeString(),
            }]);
        }
    }, []);

    useEffect(() => {
        if (isOpen && inputRef.current) inputRef.current.focus();
    }, [isOpen]);

    useEffect(() => {
        if (terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }, [commandHistory]);

    const getPrompt = () => {
        const pathDisplay = currentPath || '/';
        const displayPath = pathDisplay.length > 50 ? '...' + pathDisplay.slice(-47) : pathDisplay;
        return `user@localhost:${displayPath}$`;
    };

    const addMessage = (msg) => setCommandHistory(prev => [...prev, msg]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!currentCommand.trim() || commands.isExecuting) return;

        const command = currentCommand.trim();
        const [cmd, ...args] = command.split(' ');

        addMessage({
            type: 'command',
            prompt: getPrompt(),
            content: command,
            timestamp: new Date().toLocaleTimeString(),
        });

        history.addToHistory(command);

        let response;

        if (cmd.toLowerCase() === 'history') {
            if (history.persistentHistory.length === 0) {
                response = { type: 'output', content: t('terminal.history.noHistory') };
            } else {
                const recentCommands = history.persistentHistory.slice(-20).map((c, i) => {
                    const lineNumber = history.persistentHistory.length - 20 + i + 1;
                    return `${lineNumber.toString().padStart(3, ' ')}  ${c}`;
                }).join('\n');
                response = { type: 'output', content: t('terminal.history.recentWithTip', { commands: recentCommands }) };
            }
        } else {
            response = await commands.handleBuiltinCommand(cmd.toLowerCase(), args, {
                clearDisplay: () => setCommandHistory([]),
                clearHistory: history.clearHistory,
            });
        }

        if (response === null && cmd.toLowerCase() !== 'clear') {
            response = await commands.executeSystemCommand(command);
        }

        if (response && (response.content.trim() || response.type === 'system')) {
            addMessage({
                ...response,
                originalCommand: response.type === 'output' ? command : undefined,
                timestamp: new Date().toLocaleTimeString(),
            });
        }

        setCurrentCommand('');
        history.resetIndex();
    };

    const handleChange = (e) => {
        if (isSearchMode) {
            setSearchQuery(e.target.value);
            const results = history.searchHistory(e.target.value);
            setSearchResults(results);
            setSelectedSearchIndex(results.length > 0 ? 0 : -1);
        } else {
            setCurrentCommand(e.target.value);
        }
    };

    const exitSearchMode = () => {
        setIsSearchMode(false);
        setSearchQuery('');
        setSearchResults([]);
        setSelectedSearchIndex(-1);
    };

    const handleKeyDown = async (e) => {
        if (e.ctrlKey && e.key === 'r') {
            e.preventDefault();
            if (!isSearchMode) {
                setIsSearchMode(true);
                setSearchQuery('');
                setCurrentCommand('');
            }
            return;
        }

        if (isSearchMode) {
            if (e.key === 'Escape') { e.preventDefault(); exitSearchMode(); return; }
            if (e.key === 'Enter') {
                e.preventDefault();
                if (selectedSearchIndex >= 0 && searchResults[selectedSearchIndex]) {
                    setCurrentCommand(searchResults[selectedSearchIndex]);
                    exitSearchMode();
                }
                return;
            }
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                if (searchResults.length > 0) {
                    setSelectedSearchIndex(e.key === 'ArrowUp'
                        ? (selectedSearchIndex > 0 ? selectedSearchIndex - 1 : searchResults.length - 1)
                        : (selectedSearchIndex < searchResults.length - 1 ? selectedSearchIndex + 1 : 0));
                }
                return;
            }
            return;
        }

        if (e.ctrlKey && e.key === 'c') {
            e.preventDefault();
            if (commands.isExecuting) {
                commands.abortExecution();
                addMessage({ type: 'error', content: t('terminal.system.commandInterrupted'), timestamp: new Date().toLocaleTimeString() });
                setCurrentCommand('');
                history.resetIndex();
                return;
            } else if (currentCommand.trim()) {
                addMessage({ type: 'command', prompt: getPrompt(), content: currentCommand + ' ^C', timestamp: new Date().toLocaleTimeString() });
                setCurrentCommand('');
                history.resetIndex();
                return;
            }
        }

        if (commands.isExecuting) return;

        if (e.key === 'ArrowUp') {
            e.preventDefault();
            const cmd = history.navigateUp();
            if (cmd !== null) setCurrentCommand(cmd);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            const cmd = history.navigateDown();
            if (cmd !== null) setCurrentCommand(cmd);
        } else if (e.key === 'Tab') {
            e.preventDefault();
            await commands.handleTabCompletion(currentCommand, setCurrentCommand, addMessage);
        }
    };

    const escapeHtml = (str) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const formatOutput = (content, command = '') => {
        if (!content || typeof content !== 'string') return content;
        const escaped = escapeHtml(content);

        if (command.startsWith('ls') || command.startsWith('dir')) {
            return escaped.split(/\s+/).map(item => {
                if (item.endsWith('/')) return `<span class="terminal-directory">${item}</span>`;
                if (item.includes('.')) return `<span class="terminal-file terminal-file-${item.split('.').pop().toLowerCase()}">${item}</span>`;
                return `<span class="terminal-file">${item}</span>`;
            }).join('  ');
        }

        if (escaped.trim().match(/^[\d\.]+$/) || escaped.trim().match(/^v?[\d\.]+(-[\w\.]+)?$/) ||
            escaped.trim().match(/^\/[\w\-\.\/]+$/) || escaped.trim().match(/^[A-Za-z]:[\\\w\-\.\\]+$/)) {
            return escaped;
        }

        let fmt = escaped;
        fmt = fmt.replace(/\b([\/\\][\w\-\.\/\\]{3,})\b/g, '<span class="terminal-path">$1</span>');
        fmt = fmt.replace(/(https?:\/\/[^\s]+)/g, '<span class="terminal-url">$1</span>');
        fmt = fmt.replace(/&quot;([^&]+)&quot;/g, '<span class="terminal-string">"$1"</span>');
        return fmt;
    };

    if (!isOpen) return null;

    return (
        <div className="enhanced-terminal" style={{ height: `${terminalHeight}px` }}>
            <div className="terminal-header">
                <div className="terminal-title">
                    <span>{t('terminal.title')}</span>
                </div>
                <div className="terminal-controls">
                    <button
                        className="terminal-control terminal-clear"
                        onClick={() => setCommandHistory([])}
                        title={t('terminal.clearTitle')}
                        aria-label={t('terminal.clearAria')}
                    >
                        <Icon name="trash" size="small" className="terminal-icon" />
                    </button>
                    <button
                        className="terminal-control terminal-close"
                        onClick={onToggle}
                        title={t('terminal.closeTitle')}
                        aria-label={t('terminal.closeAria')}
                    >
                        <Icon name="x" size="small" className="terminal-icon" />
                    </button>
                </div>
            </div>
            <div className="terminal-content" ref={terminalRef}>
                {commandHistory.map((entry, index) => (
                    <div key={index} className={`terminal-line terminal-${entry.type}`}>
                        <div className="terminal-entry">
                            {entry.type === 'command' && (
                                <div className="terminal-command-line">
                                    <span className="terminal-prompt-user">{entry.prompt.split('@')[0]}</span>
                                    <span className="terminal-prompt-at">@</span>
                                    <span className="terminal-prompt-host">{entry.prompt.split('@')[1].split(':')[0]}</span>
                                    <span className="terminal-prompt-colon">:</span>
                                    <span className="terminal-prompt-path">{entry.prompt.split(':')[1].replace('$', '')}</span>
                                    <span className="terminal-prompt-dollar">$ </span>
                                    <span className="terminal-command-text">{entry.content}</span>
                                </div>
                            )}
                            {entry.type !== 'command' && (
                                <pre
                                    className="terminal-text"
                                    dangerouslySetInnerHTML={{
                                        __html: entry.type === 'output' && entry.originalCommand
                                            ? formatOutput(entry.content, entry.originalCommand)
                                            : escapeHtml(entry.content || '')
                                    }}
                                ></pre>
                            )}
                        </div>
                    </div>
                ))}
                <form onSubmit={handleSubmit} className="terminal-input-line">
                    {isSearchMode ? (
                        <span className="terminal-prompt-search">{t('terminal.search.prompt')}</span>
                    ) : (
                        <div className="terminal-current-prompt">
                            <span className="terminal-prompt-user">{getPrompt().split('@')[0]}</span>
                            <span className="terminal-prompt-at">@</span>
                            <span className="terminal-prompt-host">{getPrompt().split('@')[1].split(':')[0]}</span>
                            <span className="terminal-prompt-colon">:</span>
                            <span className="terminal-prompt-path">{getPrompt().split(':')[1].replace('$', '')}</span>
                            <span className="terminal-prompt-dollar">$ </span>
                        </div>
                    )}
                    <input
                        ref={inputRef}
                        type="text"
                        className="terminal-input"
                        value={isSearchMode ? searchQuery : currentCommand}
                        onChange={handleChange}
                        onKeyDown={handleKeyDown}
                        disabled={commands.isExecuting}
                        autoFocus
                        spellCheck="false"
                        autoComplete="off"
                        autoCapitalize="off"
                        placeholder={isSearchMode ? t('terminal.searchPlaceholder') : ''}
                    />
                    {!isSearchMode && commands.isExecuting && (
                        <span className="terminal-executing">
                            <span className="spinner-small"></span>
                            <span className="terminal-interrupt-hint">{t('terminal.system.runningHint')}</span>
                        </span>
                    )}
                </form>
            </div>
        </div>
    );
};

export default Terminal;

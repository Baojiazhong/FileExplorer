import { useState, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';

const BUILTIN_COMMANDS = ['help', 'clear', 'history', 'ls', 'dir', 'pwd', 'cd', 'mkdir', 'touch', 'cat', 'tree', 'echo', 'whoami', 'date', 'find', 'which', 'ping', 'exit'];

const useTerminalCommands = ({ currentPath, navigateTo, onToggle, t }) => {
    const [isExecuting, setIsExecuting] = useState(false);
    const abortControllerRef = useRef(null);

    const executeSystemCommand = useCallback(async (command) => {
        const controller = new AbortController();
        abortControllerRef.current = controller;
        setIsExecuting(true);

        try {
            const longRunningCommands = ['ping', 'traceroute', 'curl', 'wget', 'tail -f', 'watch'];
            const isLongRunning = longRunningCommands.some(cmd => command.toLowerCase().startsWith(cmd));

            const commandPromise = isLongRunning
                ? invoke('execute_command_with_timeout', { command, working_directory: currentPath, timeout_seconds: 30 })
                : invoke('execute_command_improved', { command, working_directory: currentPath });

            const cancelPromise = new Promise((_, reject) => {
                controller.signal.addEventListener('abort', () => reject(new Error('Command cancelled')));
            });

            const output = await Promise.race([commandPromise, cancelPromise]);

            if (typeof output === 'string') {
                try {
                    const parsed = JSON.parse(output);
                    if (parsed.stdout === "" && parsed.stderr === "" && parsed.status === 0) return { type: 'output', content: '' };
                    if (parsed.status === 1) {
                        if (parsed.stdout === "" && parsed.stderr === "") return { type: 'error', content: t('terminal.errors.commandNotFound', { command: command.split(' ')[0] }) };
                        if (parsed.stderr) return { type: 'error', content: parsed.stderr.trim() };
                    }
                    if (parsed.stdout?.trim()) return { type: 'output', content: parsed.stdout.trim() };
                    if (parsed.stderr?.trim()) return { type: 'error', content: parsed.stderr.trim() };
                    return { type: parsed.status === 0 ? 'output' : 'error', content: parsed.status === 0 ? (output || '') : t('terminal.errors.commandFailedWithStatus', { status: parsed.status }) };
                } catch {
                    return { type: 'output', content: output || '' };
                }
            } else if (typeof output === 'object') {
                if (output.stdout === "" && output.stderr === "" && output.status === 0) return { type: 'output', content: '' };
                if (output.status === 1) {
                    if (output.stdout === "" && output.stderr === "") return { type: 'error', content: t('terminal.errors.commandNotFound', { command: command.split(' ')[0] }) };
                    if (output.stderr) return { type: 'error', content: output.stderr };
                }
                if (output.stdout) return { type: 'output', content: output.stdout };
                return { type: output.status === 0 ? 'output' : 'error', content: output.status === 0 ? '' : t('terminal.errors.commandFailedWithStatus', { status: output.status }) };
            }

            return { type: 'output', content: output || '' };
        } catch (error) {
            if (error.message === 'Command cancelled') return { type: 'system', content: t('terminal.system.commandCancelled') };

            let errorMessage = '';
            try {
                if (typeof error === 'string') {
                    try { const p = JSON.parse(error); errorMessage = p.custom_message || p.message_from_code || p.message || error; } catch { errorMessage = error; }
                } else if (typeof error === 'object') {
                    errorMessage = error.custom_message || error.message_from_code || error.message || JSON.stringify(error);
                } else { errorMessage = String(error); }
            } catch { errorMessage = String(error); }

            return { type: 'error', content: t('terminal.errors.errorPrefix', { message: errorMessage }) };
        } finally {
            setIsExecuting(false);
            abortControllerRef.current = null;
        }
    }, [currentPath, t]);

    const handleBuiltinCommand = useCallback(async (command, args, { clearDisplay, clearHistory: clearHist }) => {
        switch (command) {
            case 'help':
                return { type: 'output', content: t('terminal.help.text') };

            case 'clear':
                if (args.length > 0 && args[0] === 'history') {
                    clearHist();
                    return { type: 'system', content: t('terminal.system.historyCleared') };
                }
                clearDisplay();
                return null;

            case 'history':
                return null; // handled by caller with persistentHistory access

            case 'cd': {
                try {
                    if (args.length === 0) {
                        try {
                            const homeResult = await invoke('execute_command_improved', {
                                command: process.platform === 'win32' ? 'echo %USERPROFILE%' : 'echo $HOME',
                                working_directory: null
                            });
                            let homeDir;
                            if (typeof homeResult === 'string') {
                                homeDir = JSON.parse(homeResult).stdout.trim();
                            }
                            if (homeDir) {
                                await navigateTo(homeDir);
                                return { type: 'output', content: '' };
                            }
                        } catch {
                            return { type: 'output', content: currentPath || '/' };
                        }
                    }

                    let targetPath = args[0];
                    let resolvedPath;
                    if (targetPath === '~') {
                        const homeResult = await invoke('execute_command_improved', {
                            command: process.platform === 'win32' ? 'echo %USERPROFILE%' : 'echo $HOME',
                            working_directory: null
                        });
                        if (typeof homeResult === 'string') resolvedPath = JSON.parse(homeResult).stdout.trim();
                    } else if (targetPath.startsWith('/') || targetPath.match(/^[A-Za-z]:/)) {
                        resolvedPath = targetPath;
                    } else {
                        const basePath = currentPath || '/';
                        resolvedPath = basePath === '/' ? '/' + targetPath : basePath + '/' + targetPath;
                    }

                    if (resolvedPath.endsWith('/') && resolvedPath.length > 1) resolvedPath = resolvedPath.slice(0, -1);

                    const parts = resolvedPath.split('/');
                    const stack = [];
                    for (let part of parts) {
                        if (part === '' || part === '.') continue;
                        if (part === '..') { if (stack.length > 0) stack.pop(); }
                        else stack.push(part);
                    }

                    const finalPath = stack.length > 0 ? '/' + stack.join('/') : '/';
                    await navigateTo(finalPath);
                    return { type: 'output', content: '' };
                } catch {
                    return { type: 'error', content: t('terminal.errors.cdNoSuchFileOrDir', { path: args[0] || '' }) };
                }
            }

            case 'pwd':
                return { type: 'output', content: currentPath || '/' };

            case 'whoami':
                return { type: 'output', content: 'user' };

            case 'date':
                return { type: 'output', content: new Date().toString() };

            case 'ls':
            case 'dir':
                try {
                    const dirContent = await invoke('open_directory', { path: currentPath });
                    const data = JSON.parse(dirContent);
                    if (data.directories.length === 0 && data.files.length === 0) return { type: 'output', content: t('terminal.ls.directoryEmpty') };
                    const allItems = [...data.directories.map(dir => `${dir.name}/`), ...data.files.map(file => file.name)];
                    return { type: 'output', content: allItems.join('  ') };
                } catch (error) {
                    return { type: 'error', content: t('terminal.errors.cannotListDirectory', { message: error.message || error }) };
                }

            case 'tree':
                try {
                    const dirContent = await invoke('open_directory', { path: currentPath });
                    const data = JSON.parse(dirContent);
                    const pathParts = currentPath.split('/').filter(p => p);
                    const folderName = pathParts[pathParts.length - 1] || t('terminal.tree.rootFolderName');
                    let tree = `📁 ${folderName}/\n`;
                    if (data.directories.length + data.files.length === 0) {
                        tree += `   ${t('terminal.tree.emptyDirectory')}\n`;
                        return { type: 'output', content: tree };
                    }
                    const sortedDirs = data.directories.sort((a, b) => a.name.localeCompare(b.name));
                    const sortedFiles = data.files.sort((a, b) => a.name.localeCompare(b.name));
                    sortedDirs.forEach((dir, i) => {
                        tree += `${i === sortedDirs.length - 1 && sortedFiles.length === 0 ? '└── ' : '├── '}📁 ${dir.name}/\n`;
                    });
                    sortedFiles.forEach((file, i) => {
                        const ext = file.name.split('.').pop()?.toLowerCase() || '';
                        let icon = '📄';
                        if (['js', 'jsx'].includes(ext)) icon = '🟨';
                        else if (['ts', 'tsx'].includes(ext)) icon = '🔷';
                        else if (ext === 'py') icon = '🐍';
                        else if (ext === 'java') icon = '☕';
                        else if (ext === 'rs') icon = '🦀';
                        else if (['png', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext)) icon = '🖼️';
                        else if (ext === 'pdf') icon = '📕';
                        else if (['zip', 'tar', 'gz'].includes(ext)) icon = '📦';
                        else if (ext === 'md') icon = '📝';
                        tree += `${i === sortedFiles.length - 1 ? '└── ' : '├── '}${icon} ${file.name}\n`;
                    });
                    tree += `\n📊 ${t('terminal.tree.summary', { directories: sortedDirs.length, files: sortedFiles.length })}`;
                    return { type: 'output', content: tree };
                } catch (error) {
                    return { type: 'error', content: t('terminal.errors.cannotGenerateTree', { message: error.message || error }) };
                }

            case 'echo':
                return { type: 'output', content: args.join(' ') };

            case 'mkdir':
                if (args.length === 0) return { type: 'error', content: t('terminal.mkdir.missingOperand') };
                try {
                    await invoke('create_directory', { folder_path_abs: currentPath, directory_name: args[0] });
                    return { type: 'output', content: t('terminal.mkdir.created', { name: args[0] }) };
                } catch (error) {
                    return { type: 'error', content: t('terminal.mkdir.failed', { message: error.message || error }) };
                }

            case 'touch':
                if (args.length === 0) return { type: 'error', content: t('terminal.touch.missingOperand') };
                try {
                    await invoke('create_file', { folder_path_abs: currentPath, file_name: args[0] });
                    return { type: 'output', content: t('terminal.touch.created', { name: args[0] }) };
                } catch (error) {
                    return { type: 'error', content: t('terminal.touch.failed', { message: error.message || error }) };
                }

            case 'cat':
                if (args.length === 0) return { type: 'error', content: t('terminal.cat.missingOperand') };
                try {
                    const content = await invoke('open_file', { file_path: `${currentPath}/${args[0]}` });
                    return { type: 'output', content };
                } catch (error) {
                    return { type: 'error', content: t('terminal.cat.failed', { message: error.message || error }) };
                }

            case 'find':
                if (args.length === 0) return { type: 'error', content: t('terminal.find.missingPattern') };
                try {
                    const pattern = args[0].toLowerCase();
                    const dirContent = await invoke('open_directory', { path: currentPath });
                    const data = JSON.parse(dirContent);
                    const matches = [
                        ...data.directories.filter(d => d.name.toLowerCase().includes(pattern)).map(d => `📁 ${d.name}/`),
                        ...data.files.filter(f => f.name.toLowerCase().includes(pattern)).map(f => {
                            const ext = f.name.split('.').pop()?.toLowerCase() || '';
                            let icon = '📄';
                            if (['js', 'jsx'].includes(ext)) icon = '🟨';
                            else if (['ts', 'tsx'].includes(ext)) icon = '🔷';
                            else if (ext === 'py') icon = '🐍';
                            else if (['png', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext)) icon = '🖼️';
                            return `${icon} ${f.name}`;
                        })
                    ];
                    if (matches.length === 0) return { type: 'output', content: t('terminal.find.noMatches', { pattern: args[0] }) };
                    return { type: 'output', content: t('terminal.find.matches', { count: matches.length, pattern: args[0], matches: matches.join('\n') }) };
                } catch (error) {
                    return { type: 'error', content: t('terminal.find.failed', { message: error.message || error }) };
                }

            case 'which':
                if (args.length === 0) return { type: 'error', content: t('terminal.which.missingCommandName') };
                if (BUILTIN_COMMANDS.includes(args[0].toLowerCase())) {
                    return { type: 'output', content: t('terminal.which.builtin', { command: args[0].toLowerCase() }) };
                }
                try {
                    await invoke('execute_command_improved', { command: `${args[0]} --version`, working_directory: currentPath });
                    return { type: 'output', content: t('terminal.which.system', { command: args[0] }) };
                } catch {
                    return { type: 'output', content: t('terminal.which.notFound', { command: args[0] }) };
                }

            case 'exit':
                onToggle();
                return { type: 'system', content: t('terminal.system.closed') };

            default:
                return null;
        }
    }, [currentPath, navigateTo, onToggle, t]);

    const handleTabCompletion = useCallback(async (currentCommand, setCurrentCommand, addMessage) => {
        if (!currentCommand.trim()) return;

        const parts = currentCommand.split(' ');
        const lastPart = parts[parts.length - 1];

        if (parts.length === 1) {
            const matches = BUILTIN_COMMANDS.filter(cmd => cmd.startsWith(lastPart.toLowerCase()));
            if (matches.length === 1) {
                setCurrentCommand(matches[0] + ' ');
            } else if (matches.length > 1) {
                addMessage({ type: 'system', content: t('terminal.completion.availableCommands', { commands: matches.join(', ') }), timestamp: new Date().toLocaleTimeString() });
            }
        } else {
            try {
                const dirContent = await invoke('open_directory', { path: currentPath });
                const data = JSON.parse(dirContent);
                const allItems = [...data.directories.map(d => d.name + '/'), ...data.files.map(f => f.name)];
                const matches = allItems.filter(item => item.toLowerCase().startsWith(lastPart.toLowerCase()));
                if (matches.length === 1) {
                    setCurrentCommand([...parts.slice(0, -1), matches[0]].join(' '));
                } else if (matches.length > 1) {
                    addMessage({ type: 'system', content: t('terminal.completion.availableItems', { items: matches.join(', ') }), timestamp: new Date().toLocaleTimeString() });
                }
            } catch {}
        }
    }, [currentPath, t]);

    const abortExecution = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            setIsExecuting(false);
            abortControllerRef.current = null;
        }
    }, []);

    return {
        isExecuting,
        executeSystemCommand,
        handleBuiltinCommand,
        handleTabCompletion,
        abortExecution,
    };
};

export default useTerminalCommands;

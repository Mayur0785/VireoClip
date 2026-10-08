import React, { useState, useEffect } from 'react';
import {
  Scissors,
  Type,
  Subtitles,
  Crop,
  Volume2,
  Wand2,
  Play,
  RotateCcw,
  RotateCw,
  Search,
} from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSplit: () => void;
  onAddText: () => void;
  onAddCaption: () => void;
  onReframe: () => void;
  onNormalizeAudio: () => void;
  onOpenProducer: () => void;
  onRender: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onSplit,
  onAddText,
  onAddCaption,
  onReframe,
  onNormalizeAudio,
  onOpenProducer,
  onRender,
  onUndo,
  onRedo,
}) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const commands = [
    { id: 'split', title: 'Split Selected Clip', icon: <Scissors className="w-4 h-4 text-orange-400" />, shortcut: 'S', action: onSplit },
    { id: 'add-text', title: 'Add Text Layer', icon: <Type className="w-4 h-4 text-purple-400" />, action: onAddText },
    { id: 'add-caption', title: 'Add Caption Track', icon: <Subtitles className="w-4 h-4 text-amber-400" />, action: onAddCaption },
    { id: 'reframe', title: 'Reframe to 9:16 Vertical', icon: <Crop className="w-4 h-4 text-blue-400" />, action: onReframe },
    { id: 'normalize-audio', title: 'Normalize Speech Audio (Loudnorm)', icon: <Volume2 className="w-4 h-4 text-emerald-400" />, action: onNormalizeAudio },
    { id: 'producer', title: 'Open AI Producer Assistant', icon: <Wand2 className="w-4 h-4 text-indigo-400" />, action: onOpenProducer },
    { id: 'render', title: 'Render Final Video', icon: <Play className="w-4 h-4 text-green-400" />, action: onRender },
    { id: 'undo', title: 'Undo Last Edit', icon: <RotateCcw className="w-4 h-4 text-neutral-400" />, shortcut: '⌘Z', action: onUndo },
    { id: 'redo', title: 'Redo Edit', icon: <RotateCw className="w-4 h-4 text-neutral-400" />, shortcut: '⌘⇧Z', action: onRedo },
  ];

  const filtered = commands.filter((c) =>
    c.title.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center pt-24 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center px-4 py-3 border-b border-neutral-800 gap-2.5">
          <Search className="w-4 h-4 text-neutral-400" />
          <input
            autoFocus
            type="text"
            placeholder="Type a command or shortcut..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-sm text-white focus:outline-none placeholder-neutral-500"
          />
          <span className="text-[10px] font-mono text-neutral-500 bg-neutral-800 px-1.5 py-0.5 rounded">
            ESC
          </span>
        </div>

        <div className="max-h-72 overflow-y-auto p-2 space-y-1">
          {filtered.length > 0 ? (
            filtered.map((cmd) => (
              <button
                key={cmd.id}
                type="button"
                onClick={() => {
                  cmd.action();
                  onClose();
                }}
                className="w-full px-3 py-2.5 rounded-lg flex items-center justify-between hover:bg-neutral-800/80 transition text-left text-xs text-neutral-200 group"
              >
                <div className="flex items-center gap-2.5">
                  {cmd.icon}
                  <span className="font-medium group-hover:text-white">{cmd.title}</span>
                </div>
                {cmd.shortcut && (
                  <span className="font-mono text-[10px] text-neutral-500 bg-neutral-950 px-2 py-0.5 rounded border border-neutral-800">
                    {cmd.shortcut}
                  </span>
                )}
              </button>
            ))
          ) : (
            <div className="text-center py-6 text-xs text-neutral-500">
              No matching editor commands found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useState, useRef, useEffect } from 'react';

interface EditableSelectProps {
  value: string;
  options: string[];
  placeholder?: string;
  onChange: (value: string) => void;
}

const EditableSelect: React.FC<EditableSelectProps> = ({ value, options, placeholder, onChange }) => {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const selRef = useRef<HTMLSelectElement>(null);

  useEffect(() => { setInputVal(value); }, [value]);

  const uniqueOptions = [...new Set(options.filter(Boolean))].sort();

  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === '__new__') {
      setEditing(true);
      setInputVal('');
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setInputVal(val);
      onChange(val);
    }
  };

  const handleInputBlur = () => {
    const trimmed = inputVal.trim();
    if (trimmed) onChange(trimmed);
    setEditing(false);
  };

  const handleInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { handleInputBlur(); }
    if (e.key === 'Escape') { setEditing(false); setInputVal(value); }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={inputVal}
        onChange={e => setInputVal(e.target.value)}
        onBlur={handleInputBlur}
        onKeyDown={handleInputKey}
        placeholder="输入新值后回车"
        style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--accent)', borderRadius: 4, fontSize: 13, outline: 'none' }}
      />
    );
  }

  return (
    <select ref={selRef} value={value || ''} onChange={handleSelect}
      style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--border-color)', borderRadius: 4, fontSize: 13, background: 'white' }}>
      <option value="" disabled>{placeholder || '请选择'}</option>
      {uniqueOptions.map(opt => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
      <option value="__new__" style={{ color: 'var(--accent)', fontWeight: 600 }}>➕ 新增...</option>
    </select>
  );
};

export default EditableSelect;

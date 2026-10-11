import React from 'react';
import { useLanguage } from '../context/LanguageContext';

const LanguageSwitcher = ({ className = '' }) => {
  const { language, setLanguage } = useLanguage();

  return (
    <label className={`language-switcher ${className}`.trim()}>
      <span className="language-switcher-label">Language / ቋንቋ</span>
      <select
        aria-label="Language / ቋንቋ"
        value={language}
        onChange={(event) => setLanguage(event.target.value)}
      >
        <option value="en">English</option>
        <option value="am">አማርኛ</option>
        <option value="om">Afaan Oromoo</option>
        <option value="ti">ትግርኛ</option>
        <option value="sid">Sidaamu Afoo</option>
      </select>
    </label>
  );
};

export default LanguageSwitcher;

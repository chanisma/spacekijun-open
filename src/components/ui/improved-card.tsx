import React from 'react';
import './improved-card.css';

interface ImprovedCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export const ImprovedCard: React.FC<ImprovedCardProps> = ({ children, className = '', onClick }) => {
  return (
    <div className={`improved-card ${className}`} onClick={onClick}>
      {children}
    </div>
  );
};

export default ImprovedCard;
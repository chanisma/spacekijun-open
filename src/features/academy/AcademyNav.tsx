import { Link, NavLink } from 'react-router-dom';
import { BookOpen, Bird, Castle, Telescope } from 'lucide-react';
import styles from './academy.module.css';

export function AcademyNav() {
  return <header className={styles.navigation}>
    <Link to="/academy" className={styles.brand}><Castle size={23} /><span><small>RIA & LUON’S ACADEMY</small><strong>별빛 탐구 아카데미</strong></span></Link>
    <nav aria-label="아카데미 장소">
      {[
        { to: '/academy', label: '중앙 광장', icon: Castle, end: true },
        { to: '/academy/library', label: '왕립 도서관', icon: BookOpen },
        { to: '/academy/observatory', label: '별의 연구시설', icon: Telescope },
        { to: '/academy/post', label: '전서구 우편국', icon: Bird },
      ].map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => isActive ? styles.activeNav : undefined}><Icon size={16} />{label}</NavLink>)}
    </nav>
  </header>;
}

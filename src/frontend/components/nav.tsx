import React from 'react';
import { Link } from 'react-router-dom';

const NAV_ITEMS = [
  { path: '/', label: '首页', exact: true },
  { path: '/apply', label: '访客申请', exact: false },
  { path: '/approval', label: '审批管理', exact: false },
  { path: '/passes', label: '通行核验', exact: false },
  { path: '/records', label: '记录查询', exact: false },
] as const;

const Nav: React.FC = () => {
  const currentPath = window.location.pathname;

  return (
    <nav className="nav-bar">
      <div className="nav-brand">校园访客管理系统</div>
      <ul className="nav-links">
        {NAV_ITEMS.map((item) => {
          const isActive = item.exact
            ? currentPath === item.path
            : currentPath.startsWith(item.path);
          return (
            <li key={item.path} className={isActive ? 'nav-item active' : 'nav-item'}>
              <Link to={item.path}>{item.label}</Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export default Nav;

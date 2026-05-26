import React from 'react';
import { Link } from 'react-router-dom';

const MODULES = [
  { path: '/apply', title: '访客申请', desc: '填写访客信息，提交来访申请' },
  { path: '/approval', title: '审批管理', desc: '审批待处理的来访申请' },
  { path: '/passes', title: '通行核验', desc: '核验通行证，确认到访' },
  { path: '/records', title: '记录查询', desc: '查询历史来访记录' },
];

const Home: React.FC = () => {
  return (
    <div className="page home-page">
      <h1 className="page-title">校园访客管理系统</h1>
      <p className="page-subtitle">无登录、轻量化的校园访客全流程数字化管理工具</p>
      <div className="module-grid">
        {MODULES.map((m) => (
          <Link key={m.path} to={m.path} className="module-card">
            <h3>{m.title}</h3>
            <p>{m.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default Home;

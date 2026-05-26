import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Nav from './components/nav';
import { ToastProvider } from './components/toast';
import Home from './pages/home';
import VisitorApply from './pages/apply';
import ApplyDetail from './pages/apply/detail';
import ApprovalManagement from './pages/approval';
import PassList from './pages/passes';
import PassDetail from './pages/passes/detail';
import RecordList from './pages/records';
import RecordDetail from './pages/records/detail';

const App: React.FC = () => {
  return (
    <ToastProvider>
      <div className="app-layout">
        <Nav />
        <main className="app-main">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/apply" element={<VisitorApply />} />
            <Route path="/apply/:id" element={<ApplyDetail />} />
            <Route path="/approval" element={<ApprovalManagement />} />
            <Route path="/passes" element={<PassList />} />
            <Route path="/passes/:id" element={<PassDetail />} />
            <Route path="/records" element={<RecordList />} />
            <Route path="/records/:id" element={<RecordDetail />} />
          </Routes>
        </main>
      </div>
    </ToastProvider>
  );
};

export default App;

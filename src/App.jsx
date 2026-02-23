import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Onboarding from './components/Onboarding';
import Dashboard from './components/Dashboard';
import AddTransaction from './components/AddTransaction';
import BudgetsGoals from './components/BudgetsGoals';
import Transactions from './components/Transactions';
import ExpenseDetail from './components/ExpenseDetail';
import Profile from './components/Profile';
import { AuthProvider } from './contexts/AuthContextProvider';
import PrivateRoute from './components/PrivateRoute';

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen bg-background-light dark:bg-background-dark text-text-main dark:text-gray-100 transition-colors duration-300 font-display">
          <main className="max-w-md mx-auto bg-surface-light dark:bg-surface-dark min-h-screen shadow-soft relative overflow-hidden">
            <Routes>
              <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="/add" element={<PrivateRoute><AddTransaction /></PrivateRoute>} />
              <Route path="/budgets" element={<PrivateRoute><BudgetsGoals /></PrivateRoute>} />
              <Route path="/transactions" element={<PrivateRoute><Transactions /></PrivateRoute>} />
              <Route path="/expenses" element={<PrivateRoute><ExpenseDetail /></PrivateRoute>} />
              <Route path="/profile" element={<PrivateRoute><Profile /></PrivateRoute>} />
            </Routes>
          </main>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;

import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Onboarding from './components/Onboarding';
import Dashboard from './components/Dashboard';
import AddTransaction from './components/AddTransaction';
import BudgetsGoals from './components/BudgetsGoals';
import Transactions from './components/Transactions';
import ExpenseDetail from './components/ExpenseDetail';
import Profile from './components/Profile';
import RecurringExpenses from './components/RecurringExpenses';
import MonthlyBudget from './components/MonthlyBudget';
import CreditCards from './components/CreditCards';
import AIAdvisor from './components/AIAdvisor';
import Loans from './components/Loans';
import { AuthProvider } from './contexts/AuthContextProvider';
import PrivateRoute from './components/PrivateRoute';

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen bg-background-light dark:bg-background-dark text-text-main dark:text-gray-100 transition-all duration-500 ease-in-out font-display">
          <main className="max-w-md mx-auto bg-surface-light dark:bg-surface-dark min-h-screen shadow-soft relative overflow-hidden transition-all duration-500 ease-in-out">
            <Routes>
              <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="/add" element={<PrivateRoute><AddTransaction /></PrivateRoute>} />
              <Route path="/add/:txId" element={<PrivateRoute><AddTransaction /></PrivateRoute>} />
              <Route path="/budgets" element={<PrivateRoute><BudgetsGoals /></PrivateRoute>} />
              <Route path="/transactions" element={<PrivateRoute><Transactions /></PrivateRoute>} />
              <Route path="/expenses" element={<PrivateRoute><ExpenseDetail /></PrivateRoute>} />
              <Route path="/profile" element={<PrivateRoute><Profile /></PrivateRoute>} />
              <Route path="/recurring" element={<PrivateRoute><RecurringExpenses /></PrivateRoute>} />
              <Route path="/budget" element={<PrivateRoute><MonthlyBudget /></PrivateRoute>} />
              <Route path="/cards" element={<PrivateRoute><CreditCards /></PrivateRoute>} />
              <Route path="/advisor" element={<PrivateRoute><AIAdvisor /></PrivateRoute>} />
              <Route path="/loans" element={<PrivateRoute><Loans /></PrivateRoute>} />
            </Routes>
          </main>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;

import FinanceApp, { EditRecordModal } from '../features/finance/components/FinanceApp';

/** Application composition root. Keep providers and global concerns here. */
export default function App() {
  return <><FinanceApp /><EditRecordModal /></>;
}

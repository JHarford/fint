import { SourceManager } from './source-manager'
import { CsvUpload } from './csv-upload'
import { RecurringItemsManager } from './recurring-items-manager'
import { BalanceEntry } from './balance-entry'
import { DebtManager } from './debt-manager'
import { AssetManager } from './asset-manager'

export function InputTab() {
  return (
    <div className="space-y-6">
      <SourceManager />
      <CsvUpload />
      <BalanceEntry />
      <RecurringItemsManager />
      <DebtManager />
      <AssetManager />
    </div>
  )
}

import { NotificationsManager } from './notifications-manager'
import { AccountsManager } from './accounts-manager'
import { CsvUpload } from './csv-upload'
import { Categoriser } from './categoriser'
import { BudgetsManager } from './budgets-manager'
import { SavingsBucketsManager } from './savings-buckets-manager'
import { FutureObligationsManager } from './future-obligations-manager'
import { DebtManager } from './debt-manager'
import { AssetManager } from './asset-manager'

export function InputTab() {
  return (
    <div className="space-y-6">
      <NotificationsManager />
      <AccountsManager />
      <CsvUpload />
      <Categoriser />
      <BudgetsManager />
      <SavingsBucketsManager />
      <FutureObligationsManager />
      <DebtManager />
      <AssetManager />
    </div>
  )
}

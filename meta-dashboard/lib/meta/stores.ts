import { SupabaseLimitStore } from './store'
import { SupabaseJobStore } from './queueStore'
import { SupabaseSnapshotStore } from './snapshots'

export const stores = { limit: new SupabaseLimitStore(), jobs: new SupabaseJobStore(), snaps: new SupabaseSnapshotStore() }

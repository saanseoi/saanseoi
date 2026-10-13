# Statistics history reconstruction

Statistics snapshots reconstruct their selected membership by replaying inline HISTORY
events along the recorded parent ancestry. The nearest event for each pack wins across
all assigned shards before filtering or pagination. Definition references resolve only
within that ancestry, including inherited definitions stored in an earlier shard.

Use the rollback reconstruction workflow to restore a retained snapshot into an isolated
CURRENT candidate. Validate pack membership, definition hashes and publication scope
before delivering its final differences. Reconstruction does not rewrite HISTORY.

Fresh HISTORY databases use generated migrations. Populated content-store databases
require source reingestion and verified snapshot/shard metadata; applying the structural
migration alone does not preserve original event membership. Keep the input databases
and recovery evidence until reconstructed snapshots have been checked.

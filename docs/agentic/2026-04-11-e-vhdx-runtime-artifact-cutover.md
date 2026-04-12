# 2026-04-11 E-Backed Runtime Artifact Cutover

## Goal
- Restore `E:\\wsl2-solemd-graph.vhdx` as the real Linux-backed home for `/mnt/solemd-graph`.
- Keep live serving Postgres on the existing Docker named volume.
- Move runtime artifacts, bundles, checkpoints, and large rebuild scratch off the nearly-full WSL root filesystem.

## Why This Cutover Exists
- Current live state from WSL:
  - `/mnt/solemd-graph` is **not** a separate disk right now. `findmnt -T /mnt/solemd-graph` resolves to `/dev/sdf` on `/`.
  - `/` and `/mnt/solemd-graph` are both on the same `ext4` root filesystem with about `30G` free on a `1T` volume.
  - Host `E:` is mounted as `9p` at `/mnt/e`, which is not acceptable for hot Linux runtime/build paths.
- Current cleaned runtime-artifact footprint:
  - `/mnt/solemd-graph/bundles`: about `291M`
  - `/mnt/solemd-graph/tmp`: about `1.4M`
- Postgres is intentionally **not** part of this cutover:
  - serving DB remains on Docker named volume `solemd-graph_pgdata`
  - this cutover is for runtime artifacts and warehouse filesystem content only

## End State
- `/mnt/solemd-graph` becomes a mounted `ext4` filesystem backed by `E:\\wsl2-solemd-graph.vhdx`.
- Runtime artifact paths stay Linux-native:
  - `/mnt/solemd-graph/bundles`
  - `/mnt/solemd-graph/tmp`
  - graph build scratch and rebuild checkpoints
- Large local warehouse file trees can move there later without touching serving Postgres.

## External Prerequisites
- Windows admin shell available.
- WSL Store build that supports `wsl --mount --vhd`.
- Docker Desktop and any graph build jobs stopped before the final mount swap.
- Working Windows interop from the active WSL shell, or an out-of-band Windows terminal:
  - in the current session, `powershell.exe` is on `PATH` but actual commands fail with `UtilAcceptVsock ... failed 110`
  - `lsblk -f` currently shows no attached `solemd-graph` disk, so the VHD is not mounted in WSL today
- Verified user environment:
  - `WSL version: 2.6.3.0`
  - `Kernel version: 6.6.87.2-1`
  - this should be new enough for `wsl --mount --vhd`; the current blocker is command execution context, not feature support

Official references:
- Microsoft Learn, `wsl --mount` / `--vhd`: https://learn.microsoft.com/en-us/windows/wsl/basic-commands
- Microsoft Learn, VHD expansion and repair workflow: https://learn.microsoft.com/en-us/windows/wsl/disk-space

## Cutover Steps

### 1. Stop users of `/mnt/solemd-graph`
- Finish or stop any active graph/rag rebuilds.
- Stop services that write bundles or scratch:
  - `docker compose stop graph`
  - stop any manual `uv run python -m app.graph.build ...` or `app.corpus.entities ...` jobs
- Run `wsl --shutdown` from Windows before touching the VHD.
  - This is required for the resize/attach workflow, not optional.

### 2. Expand the VHDX on Windows
Use an elevated Windows shell.

```powershell
wsl --shutdown
diskpart
```

Inside `diskpart`:

```text
select vdisk file="E:\wsl2-solemd-graph.vhdx"
detail vdisk
expand vdisk maximum=<size-in-MB>
exit
```

Notes:
- `maximum` is in MB.
- Pick a size with real headroom for runtime artifacts and warehouse filesystem content.
- This VHDX does not need to become the serving Postgres volume.

### 3. Attach the VHD to WSL
Still from an elevated Windows shell:

```powershell
wsl --mount --vhd E:\wsl2-solemd-graph.vhdx --bare
wsl lsblk
```

Identify the new block device, then confirm the filesystem from WSL:

```bash
lsblk -f
sudo blkid /dev/<device>
```

### 4. Repair and grow the ext4 filesystem
From WSL:

```bash
sudo e2fsck -f /dev/<device>
sudo resize2fs /dev/<device>
```

This follows the Microsoft-recommended repair/grow sequence for ext4-backed WSL VHDs.

### 5. Mount it at a temporary Linux path first
Do not mount over the live `/mnt/solemd-graph` path yet.

```bash
sudo mkdir -p /mnt/solemd-graph-next
sudo mount -t ext4 /dev/<device> /mnt/solemd-graph-next
findmnt -T /mnt/solemd-graph-next
df -Th /mnt/solemd-graph-next
```

### 6. Sync current runtime artifacts into the real disk
Current artifact footprint is small enough that a clean `rsync` should be straightforward.

```bash
sudo rsync -aHAX --delete /mnt/solemd-graph/ /mnt/solemd-graph-next/
sudo du -sh /mnt/solemd-graph /mnt/solemd-graph-next
```

Before the sync, prune known-safe stale runtime trees:
- old bundle generations not referenced by the current graph release
- dead scratch trees under `tmp/`

Do **not** delete source-of-truth warehouse data as part of this sync.

### 7. Swap the mountpoint
Only after the temp mount contents are verified:

```bash
sudo umount /mnt/solemd-graph-next
sudo mv /mnt/solemd-graph /mnt/solemd-graph.rootfs-backup-2026-04-11
sudo mkdir -p /mnt/solemd-graph
sudo mount -t ext4 /dev/<device> /mnt/solemd-graph
findmnt -T /mnt/solemd-graph
df -Th /mnt/solemd-graph
```

Expected result:
- `/mnt/solemd-graph` no longer resolves to `/dev/sdf`
- it resolves to the attached VHD-backed block device instead

### 8. Validate runtime behavior
Re-check:

```bash
find /mnt/solemd-graph -maxdepth 2 -type d | sort
du -sh /mnt/solemd-graph/bundles /mnt/solemd-graph/tmp
```

Then restart the graph service and verify bundle serving:

```bash
docker compose start graph
curl -I http://localhost:3000/api/graph-bundles/<checksum>/base_points.parquet
```

### 9. Only after stability, move larger warehouse file trees
Once `/mnt/solemd-graph` is stable:
- move large local raw dataset drops
- move rebuild scratch/checkpoint trees
- remove stale `/mnt/e/...` bind-mount usage for hot runtime/build paths

Do **not** move serving Postgres as part of this cutover.

## Verification Checklist
- `findmnt -T /mnt/solemd-graph` shows a dedicated attached Linux disk, not `/dev/sdf`.
- `df -Th /mnt/solemd-graph` shows the resized ext4 VHD-backed capacity.
- `/api/graph-bundles/<checksum>/base_points.parquet` returns `200`.
- Graph bundle export and cleanup continue to target `/mnt/solemd-graph/bundles`.
- Rebuild scratch lands under `/mnt/solemd-graph/tmp`.
- Docker Postgres still reports the serving data directory on its existing named volume.

## Follow-On Work After Cutover
- Move larger warehouse filesystem trees to `/mnt/solemd-graph`.
- Keep serving tables/query paths in Postgres lean and projection-backed.
- Finish live backfills for:
  - `solemd.graph_paper_summary`
  - `solemd.entity_corpus_presence`
- Apply redundant index drops only after those serving projections are verified live.

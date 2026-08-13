# Warehouse Mount — PAUSED (2026-08-10)

**Status:** the 2 TB graph warehouse is intentionally detached. Nothing was deleted.
Re-attach with the "Revert" section when graph/corpus work picks back up.

## What was paused and why

The warehouse was mounting at every boot and logon even though no graph work was
running. It cost a console-window popup at startup, kept a 1.27 TB VHDX attached,
and left three empty tmux sessions resurrected behind it. Current work does not
touch the corpus, so it was detached until needed.

## What the warehouse actually is

Worth recording, because the drive layout is easy to get backwards:

| Thing | Reality |
|---|---|
| `E:` | Samsung SSD 970 EVO Plus 2TB, **internal NVMe**, label `Backup`. Also holds Home Videos / Non Steam Games. **Not an external drive.** |
| `E:\wsl2-solemd-graph.vhdx` | The warehouse. 1273.5 GB on disk, 2.0 TB ext4 inside, label `solemd-graph`. |
| `D:` | Seagate Backup+ **USB external**, 931.5 GB. Surfaces as a 32 GB FAT32 `RECOVERY` partition (`bootmgr`, `Boot/`). Unrelated to the warehouse. Also contains `SupabaseDB_2025-09-08`. |

The warehouse is on the **internal** disk. Detaching the external USB drive does
nothing to it, and vice versa.

## Contents at time of pause

```
data         299G
tei-models    15G
cache        1.7G
bundles      291M
pg-data        -- empty
archives       -- empty
lost+found     --
tmp            --
```

`df` reported 935 GB used while `du` as the `workbench` user could only reach
~316 GB. The gap is the raw corpus under `data/`, which is root-owned and
read-only-sacred: `data/pubtator/` (~210 GB) and `data/semantic-scholar/`
(~638 GB). 848 GB of corpus + 15 GB tei-models + bundles/cache reconciles with
the 935 GB `df` figure. **The warehouse is essentially full of raw corpus — it is
not mostly empty.**

Separately, the VHDX carries ~338 GB of slack (1273 GB allocated on disk vs
935 GB used inside). Same pattern previously compacted on the Workbench VHDX;
`sparseVhd=true` is set in `.wslconfig`. Compaction is optional and was not done.

## Changes made

1. **[DONE] WSL detach** — `wsl --unmount "E:\wsl2-solemd-graph.vhdx"` (from
   Windows). `/dev/sde` and `/mnt/solemd-graph` are gone; the VHDX file on `E:`
   is untouched at 1273.5 GB.

Nothing had files open on the mount at detach time (`fuser` showed kernel only).

### Still pending — require credentials the agent did not have

2. **[PENDING] fstab** — comment the `LABEL=solemd-graph` line (line 2) in
   `/etc/fstab` so systemd stops trying to auto-mount. Needs `sudo` (password
   required, not passwordless):
   ```bash
   sudo sed -i 's|^LABEL=solemd-graph|# LABEL=solemd-graph|' /etc/fstab
   sudo systemctl daemon-reload
   ```
   Harmless if skipped — the entry is `nofail`, so boot degrades gracefully.

3. **[PENDING] Scheduled tasks** — disable in an elevated PowerShell:
   - `WSL Mount SoleMD Graph VHD` — boot + logon ×2 trigger, runs
     `wsl.exe --mount --vhd "E:\wsl2-solemd-graph.vhdx" --bare`
   - `WSL Keep Alive` — logon trigger, runs `wsl.exe -d NVIDIA-Workbench -- /bin/true`

   Until disabled, **these will re-mount the warehouse at next boot/logon** and
   the startup popups continue.

## Revert

```powershell
# Windows, elevated
Enable-ScheduledTask -TaskName 'WSL Mount SoleMD Graph VHD'
Enable-ScheduledTask -TaskName 'WSL Keep Alive'
wsl --mount --vhd "E:\wsl2-solemd-graph.vhdx" --bare
```

```bash
# WSL — uncomment the warehouse line in /etc/fstab
sudo sed -i 's|^# *\(LABEL=solemd-graph\)|\1|' /etc/fstab
sudo systemctl daemon-reload
sudo systemctl start 'mnt-solemd\x2dgraph.automount'
ls /mnt/solemd-graph   # triggers the automount
```

Verify: `df -h /mnt/solemd-graph` should show ~2.0T with the `data/` and
`tei-models/` trees intact.

## Related

- Startup popups traced to the two scheduled tasks above, not to WSL itself.
- `.wslconfig` raised to `memory=32GB` / `processors=24` on the same date
  (host is 61.6 GB / Ryzen 9 9950X3D, 16C/32T). Applies on WSL restart.

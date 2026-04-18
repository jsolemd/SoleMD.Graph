CREATE SERVER IF NOT EXISTS warehouse_fdw
    FOREIGN DATA WRAPPER postgres_fdw
    OPTIONS (
        host 'graph-db-warehouse',
        port '5432',
        dbname 'warehouse',
        fetch_size '2000',
        async_capable 'true',
        use_remote_estimate 'true',
        fdw_startup_cost '100',
        fdw_tuple_cost '0.01',
        extensions 'pgcrypto,pg_trgm'
    );

COMMENT ON SERVER warehouse_fdw IS
    'Serve-side FDW server for bounded grounding dereference into the warehouse cluster.';

-- Employment periods can only be closed through the permission-checking RPC.
revoke update,delete on public.personnel_employment_periods from authenticated;

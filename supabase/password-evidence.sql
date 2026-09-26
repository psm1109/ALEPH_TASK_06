-- Card 2 password-hash evidence query.
-- Run only in Supabase SQL Editor after creating two TEST accounts with the same password.
-- Replace only the two email placeholders. Never write the shared password in this file.
-- The result contains password hashes, but no plaintext password, token, or secret key.

with test_accounts as (
  select email, encrypted_password
  from auth.users
  where lower(email) in (
    lower('TEST_ACCOUNT_A@example.com'),
    lower('TEST_ACCOUNT_B@example.com')
  )
)
select
  email,
  encrypted_password as bcrypt_hash,
  encrypted_password ~ '^\$2[aby]\$[0-9]{2}\$.{53}$' as bcrypt_format,
  length(encrypted_password) as hash_length
from test_accounts
order by email;

with test_accounts as (
  select email, encrypted_password
  from auth.users
  where lower(email) in (
    lower('TEST_ACCOUNT_A@example.com'),
    lower('TEST_ACCOUNT_B@example.com')
  )
)
select
  count(*) as account_count,
  count(distinct encrypted_password) as distinct_hash_count,
  count(*) = 2 and count(distinct encrypted_password) = 2 as same_password_has_different_hashes
from test_accounts;

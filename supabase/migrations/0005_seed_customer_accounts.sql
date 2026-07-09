insert into accounts (user_id, name, kind)
select 'kody', name, 'customer'
from (
  values
    ('RMR'),
    ('DJJ'),
    ('FPT'),
    ('AIM Recycling')
) as seed(name)
where not exists (
  select 1 from accounts where accounts.user_id = 'kody' and accounts.name = seed.name
);

insert into customer_contacts (account_id, name, role)
select a.id, c.contact_name, c.role
from (
  values
    ('RMR', 'Clint', null::text),
    ('DJJ', 'Jackson Nutter', null::text),
    ('FPT', 'Daniel Lyons', null::text),
    ('FPT', 'Don Lyons', null::text),
    ('FPT', 'Tristan Joerger', null::text),
    ('AIM Recycling', 'Ricardo Correia', null::text),
    ('AIM Recycling', 'Paul Hookings', null::text),
    ('AIM Recycling', 'Nicholas Depetris', null::text)
) as c(account_name, contact_name, role)
join accounts a on a.name = c.account_name and a.user_id = 'kody'
where not exists (
  select 1 from customer_contacts cc where cc.account_id = a.id and cc.name = c.contact_name
);

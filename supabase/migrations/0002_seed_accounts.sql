insert into accounts (user_id, name, plant_location)
select 'kody', name, plant_location
from (
  values
    ('Cleveland-Cliffs Middletown', null),
    ('NTP-G Shear', 'Ghent, KY'),
    ('Thai Summit / TSK', 'Bardstown, KY'),
    ('KTH Parts', 'Springfield, OH'),
    ('DKPI', 'Jeffersonville, IN'),
    ('Radius', null),
    ('Commonwealth Aluminum', null),
    ('Cohen Lexington', null),
    ('Nucor Brandenburg', null),
    ('Nucor Ghent', 'Ghent, KY'),
    ('Matalco', null)
) as seed(name, plant_location)
where not exists (
  select 1 from accounts where accounts.user_id = 'kody' and accounts.name = seed.name
);

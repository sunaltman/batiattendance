-- Den Samot Warehouse Active Employees (37 of 69 — 32 excluded as resigned)
-- Red-highlighted employees in the Excel are excluded (is_active = false would be set by UPDATE below)
-- IDs are preserved from original Excel numbering (gaps are intentional — those are resigned employees)
-- Run in Supabase SQL Editor

INSERT INTO ds_employees (id, name, department, location_id, is_active)
VALUES
  ('1', 'ទិន ភាព', 'ប្រធាន', (SELECT id FROM ds_locations LIMIT 1), true),
  ('2', 'មាស មុន្នីកា', 'រដ្ឋបាល', (SELECT id FROM ds_locations LIMIT 1), true),
  ('3', 'គា សាវ៉ៃ', 'ចេញបុង', (SELECT id FROM ds_locations LIMIT 1), true),
  ('4', 'នួន ដានី', 'គណនេយ្យ', (SELECT id FROM ds_locations LIMIT 1), true),
  ('5', 'សំ ឆៃដែន', 'ស្តុកទូកក', (SELECT id FROM ds_locations LIMIT 1), true),
  ('7', 'សេង សុកុល', 'ស្តុកមឹឹក', (SELECT id FROM ds_locations LIMIT 1), true),
  ('8', 'ឈួន បូរៃ', 'ជាងជួសជុល', (SELECT id FROM ds_locations LIMIT 1), true),
  ('9', 'ឈួន ឆេង (តា)', 'បេះមឹក', (SELECT id FROM ds_locations LIMIT 1), true),
  ('11', 'សំណាង', 'ដឹក', (SELECT id FROM ds_locations LIMIT 1), true),
  ('12', 'យ៉ែន ពៅ', 'បេះមឹក', (SELECT id FROM ds_locations LIMIT 1), true),
  ('14', 'ម៉េង ហាក់់', 'មេក្រុមឡាន', (SELECT id FROM ds_locations LIMIT 1), true),
  ('17', 'រ៉ាន់ សុភ័ក្រ', 'ឡាន', (SELECT id FROM ds_locations LIMIT 1), true),
  ('21', 'ស្រេង រ៉ាឌី', 'ឡាន', (SELECT id FROM ds_locations LIMIT 1), true),
  ('22', 'ឈុន អេង', 'អាងបង្គា', (SELECT id FROM ds_locations LIMIT 1), true),
  ('24', 'នឹម ស្រីម៉ៃ', 'ការិយល័យ', (SELECT id FROM ds_locations LIMIT 1), true),
  ('26', 'ជូ វុទ្ធី', 'ស្តុកកន្ធាយ', (SELECT id FROM ds_locations LIMIT 1), true),
  ('27', 'ងន ម៉ាប់', 'ទីផ្សារ', (SELECT id FROM ds_locations LIMIT 1), true),
  ('28', 'គីម ឡា', 'ឡាន', (SELECT id FROM ds_locations LIMIT 1), true),
  ('30', 'ស៊ុន កំសត់', 'អាងបង្គា', (SELECT id FROM ds_locations LIMIT 1), true),
  ('35', 'ជ្រា ប៉េងណា', 'IT Teacher', (SELECT id FROM ds_locations LIMIT 1), true),
  ('37', 'ស៊ិន ទីណូ', 'បេះមឹក', (SELECT id FROM ds_locations LIMIT 1), true),
  ('40', 'ជូ វុត្ថា', 'បេះមឹក', (SELECT id FROM ds_locations LIMIT 1), true),
  ('42', 'ម៉េង ហ័ង', 'ដឹក', (SELECT id FROM ds_locations LIMIT 1), true),
  ('43', 'ជា ភារ័ត្ន', 'ដឹក', (SELECT id FROM ds_locations LIMIT 1), true),
  ('45', 'សុភក្រ្ត ភីនិត', 'ដឹក', (SELECT id FROM ds_locations LIMIT 1), true),
  ('47', 'ជា តារា', 'ដឹក', (SELECT id FROM ds_locations LIMIT 1), true),
  ('52', 'ថា ម៉េងអាន', 'អាងយប់', (SELECT id FROM ds_locations LIMIT 1), true),
  ('53', 'ទូច ចំរើន', 'អាងយប់', (SELECT id FROM ds_locations LIMIT 1), true),
  ('59', 'តាន់ វីរូត', 'ដឹក', (SELECT id FROM ds_locations LIMIT 1), true),
  ('62', 'អ៊ី សំណាង (បញ្ញា)', 'ដឹក', (SELECT id FROM ds_locations LIMIT 1), true),
  ('63', 'ឈួន តោ', 'វេនយប់', (SELECT id FROM ds_locations LIMIT 1), true),
  ('64', 'សូយ ណបភី', 'ដឹក', (SELECT id FROM ds_locations LIMIT 1), true),
  ('65', 'ផល សុភាស់', 'ដឹក', (SELECT id FROM ds_locations LIMIT 1), true),
  ('66', 'យឿន លីណា', 'ដឹក', (SELECT id FROM ds_locations LIMIT 1), true),
  ('67', 'យ៉ែម សុខលីន', 'ដឹក', (SELECT id FROM ds_locations LIMIT 1), true),
  ('68', 'ខន ឆៃឌី', 'ដឹក', (SELECT id FROM ds_locations LIMIT 1), true),
  ('69', 'វណ្ណៈ ធារ៉ា', 'ដឹក', (SELECT id FROM ds_locations LIMIT 1), true);

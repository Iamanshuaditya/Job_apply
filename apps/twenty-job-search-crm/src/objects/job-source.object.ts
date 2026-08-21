import { defineObject, FieldType } from 'twenty-sdk/define';
import { IDS } from 'src/constants/ids';

export default defineObject({
  universalIdentifier: IDS.job_source_object,
  nameSingular: 'jobSource',
  namePlural: 'jobSources',
  labelSingular: 'Job Source',
  labelPlural: 'Job Sources',
  description: 'Employer/ATS feeds scanned for new jobs.',
  icon: 'IconWorldSearch',
  labelIdentifierFieldMetadataUniversalIdentifier: IDS.job_source_name_field,
  fields: [
    { universalIdentifier: IDS.job_source_name_field, type: FieldType.TEXT, name: 'name', label: 'Name' },
    {
      universalIdentifier: IDS.job_source_kind_field,
      type: FieldType.SELECT,
      name: 'kind',
      label: 'ATS',
      defaultValue: "'GREENHOUSE'",
      options: [
        { id: IDS.option_source_kind_greenhouse, value: 'GREENHOUSE', label: 'Greenhouse', color: 'blue', position: 0 },
        { id: IDS.option_source_kind_lever, value: 'LEVER', label: 'Lever', color: 'blue', position: 1 },
        { id: IDS.option_source_kind_ashby, value: 'ASHBY', label: 'Ashby', color: 'blue', position: 2 },
        { id: IDS.option_source_kind_json_feed, value: 'JSON_FEED', label: 'JSON Feed', color: 'blue', position: 3 }
      ]
    },
    { universalIdentifier: IDS.job_source_company_field, type: FieldType.TEXT, name: 'company', label: 'Company' },
    { universalIdentifier: IDS.job_source_boardKey_field, type: FieldType.TEXT, name: 'boardKey', label: 'Board key / site' },
    { universalIdentifier: IDS.job_source_region_field, type: FieldType.TEXT, name: 'region', label: 'Region' },
    { universalIdentifier: IDS.job_source_enabled_field, type: FieldType.BOOLEAN, name: 'enabled', label: 'Enabled' }
  ]
});

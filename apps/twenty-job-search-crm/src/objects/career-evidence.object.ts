import { defineObject, FieldType } from 'twenty-sdk/define';
import { IDS } from 'src/constants/ids';

export default defineObject({
  universalIdentifier: IDS.career_evidence_object,
  nameSingular: 'careerEvidence',
  namePlural: 'careerEvidences',
  labelSingular: 'Career Evidence',
  labelPlural: 'Career Evidence',
  description: 'Verified facts that tailored resumes are allowed to use.',
  icon: 'IconDatabase',
  labelIdentifierFieldMetadataUniversalIdentifier: IDS.career_evidence_title_field,
  fields: [
    { universalIdentifier: IDS.career_evidence_title_field, type: FieldType.TEXT, name: 'title', label: 'Title' },
    {
      universalIdentifier: IDS.career_evidence_type_field,
      type: FieldType.SELECT,
      name: 'evidenceType',
      label: 'Type',
      defaultValue: "'EXPERIENCE'",
      options: [
        { id: IDS.option_evidence_type_EXPERIENCE, value: 'EXPERIENCE', label: 'Experience', color: 'blue', position: 0 },
        { id: IDS.option_evidence_type_PROJECT, value: 'PROJECT', label: 'Project', color: 'purple', position: 1 },
        { id: IDS.option_evidence_type_ACHIEVEMENT, value: 'ACHIEVEMENT', label: 'Achievement', color: 'green', position: 2 },
        { id: IDS.option_evidence_type_EDUCATION, value: 'EDUCATION', label: 'Education', color: 'orange', position: 3 },
        { id: IDS.option_evidence_type_CERTIFICATION, value: 'CERTIFICATION', label: 'Certification', color: 'yellow', position: 4 },
        { id: IDS.option_evidence_type_SKILL, value: 'SKILL', label: 'Skill', color: 'gray', position: 5 },
        { id: IDS.option_evidence_type_OTHER, value: 'OTHER', label: 'Other', color: 'turquoise', position: 6 }
      ]
    },
    { universalIdentifier: IDS.career_evidence_organization_field, type: FieldType.TEXT, name: 'organization', label: 'Company / project' },
    { universalIdentifier: IDS.career_evidence_fact_field, type: FieldType.TEXT, name: 'fact', label: 'Verified fact' },
    { universalIdentifier: IDS.career_evidence_skills_field, type: FieldType.TEXT, name: 'skills', label: 'Skills' },
    { universalIdentifier: IDS.career_evidence_evidenceUrl_field, type: FieldType.TEXT, name: 'evidenceUrl', label: 'Evidence URL' },
    { universalIdentifier: IDS.career_evidence_verified_field, type: FieldType.BOOLEAN, name: 'verified', label: 'Verified' }
  ]
});

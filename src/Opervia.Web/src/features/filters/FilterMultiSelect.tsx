import { MultiSelect } from './MultiSelect';
import { filterValues } from './filterSelection';
export function FilterMultiSelect({ value, onChange, ...props }: {
  label: string; placeholder: string; options: { value: string; label: string }[];
  value: string; onChange: (value: string) => void; disabled?: boolean;
}) {
  return <MultiSelect {...props} value={filterValues(value)} onChange={values => onChange(values.length > 1 ? JSON.stringify(values) : values[0] ?? '')} />;
}

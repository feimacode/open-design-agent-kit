import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

export default function Settings() {
  return (
    <Card>
      <CardHeader><CardTitle>Company</CardTitle></CardHeader>
      <CardContent><Input placeholder="Company name" /><Switch checked onCheckedChange={() => {}} size="md" /><Button>Save</Button></CardContent>
    </Card>
  );
}

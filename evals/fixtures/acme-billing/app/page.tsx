import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function Invoices() {
  return (
    <Card>
      <CardHeader><CardTitle>Invoices</CardTitle></CardHeader>
      <CardContent><Badge tone="success">Paid</Badge><Button>New invoice</Button></CardContent>
    </Card>
  );
}

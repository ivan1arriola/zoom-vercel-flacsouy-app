import { Card, CardContent, List, ListItem, ListItemText, Typography } from "@mui/material";

interface ManualPending {
  id: string;
  titulo: string;
}

interface SpaTabManualProps {
  manualPendings: ManualPending[];
}

export function SpaTabManual({ manualPendings }: SpaTabManualProps) {
  return (
    <Card variant="outlined" sx={{ borderRadius: 3 }}>
      <CardContent>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 1.5 }}>
          Pendientes de resolucion manual
        </Typography>
        {manualPendings.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No hay pendientes manuales.
          </Typography>
        ) : (
          <List dense disablePadding>
            {manualPendings.map((item) => (
              <ListItem key={item.id} divider>
                <ListItemText
                  primary={item.titulo}
                  secondary={item.id}
                  primaryTypographyProps={{ fontWeight: 600 }}
                />
              </ListItem>
            ))}
          </List>
        )}
      </CardContent>
    </Card>
  );
}

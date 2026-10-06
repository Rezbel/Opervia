export interface BasicAccessUser {
  number: string;
  password: string;
  name: string;
  role: 'Administrador' | 'Vendedor';
  sellerCode?: string;
}

export const basicAccessUsers: BasicAccessUser[] = [
  { number: '999', password: '9999', name: 'Administrador', role: 'Administrador' },
  { number: '1', password: '4101', name: 'Sergio Armando Alvarado', role: 'Vendedor', sellerCode: '1' },
  { number: '4', password: '4104', name: 'Querétaro', role: 'Vendedor', sellerCode: '4' },
  { number: '5', password: '4105', name: 'QRO Foráneo', role: 'Vendedor', sellerCode: '5' },
  { number: '7', password: '4107', name: 'Guanajuato', role: 'Vendedor', sellerCode: '7' },
  { number: '8', password: '4108', name: 'CDMX', role: 'Vendedor', sellerCode: '8' },
  { number: '9', password: '4109', name: 'Ingeniería Querétaro', role: 'Vendedor', sellerCode: '9' },
  { number: '11', password: '4111', name: 'Ingeniería Xalapa', role: 'Vendedor', sellerCode: '11' },
  { number: '12', password: '4112', name: 'San Luis Potosí', role: 'Vendedor', sellerCode: '12' },
  { number: '13', password: '4113', name: 'Ingeniería SLP', role: 'Vendedor', sellerCode: '13' },
  { number: '14', password: '4114', name: 'Huasteca', role: 'Vendedor', sellerCode: '14' },
  { number: '16', password: '4116', name: 'Clientes Clave', role: 'Vendedor', sellerCode: '16' },
  { number: '18', password: '4118', name: 'Xalapa 2', role: 'Vendedor', sellerCode: '18' },
  { number: '21', password: '4121', name: 'A.C. - Alberto Guadarrama', role: 'Vendedor', sellerCode: '21' },
];

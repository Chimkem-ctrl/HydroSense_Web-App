export type MainTabParamList = {
  Home: undefined;
  Alerts: undefined;
  Trends: undefined;
  Activity: undefined;
  FieldEntry: undefined;
  Calibration: undefined;
  Reports: undefined;
  Status: undefined;
  History: undefined;
  Review: undefined;
  Profile: undefined;
  Users: undefined;
  AuditLogs: undefined;
  Settings: undefined;
};

export const bottomBarRoutes = ['Home', 'Alerts', 'Trends', 'Status'] as const satisfies readonly (keyof MainTabParamList)[];
export type BottomBarRoute = (typeof bottomBarRoutes)[number];

export function isBottomBarRoute(name: string): name is BottomBarRoute {
  return bottomBarRoutes.some((route) => route === name);
}

export type RootStackParamList = {
  Login: undefined;
  SignUp: undefined;
  ForgotPassword: undefined;
  PendingApproval: undefined;
  Main: undefined;
  Appearance: undefined;
  AlertDetail: { alertId: string };
  ValidationReview: undefined;
};

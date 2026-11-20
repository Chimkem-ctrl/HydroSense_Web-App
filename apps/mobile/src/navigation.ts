export type MainTabParamList = {
  Home: undefined;
  Tanks: undefined;
  Alerts: undefined;
  Trends: undefined;
  More: undefined;
  Activity: undefined;
  Reports: undefined;
  Status: undefined;
  History: undefined;
  Review: undefined;
  Profile: undefined;
  Users: undefined;
  AuditLogs: undefined;
};

export const bottomBarRoutes = ['Home', 'Tanks', 'Alerts', 'Trends', 'More'] as const satisfies readonly (keyof MainTabParamList)[];
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
  AlertDetail: { alertId: string };
  ValidationReview: undefined;
};

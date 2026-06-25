import { createBrowserRouter } from "react-router-dom";
import { Main } from "./layouts/MainLayout";
import { Auth } from "./layouts/AuthLayout";

import { Login } from "@/pages/auth/Login";
import { Trading } from "@/pages/trading/Trading";
import { Portfolio } from "@/pages/trading/Portfolio";

export const routes = createBrowserRouter([
  {
    element: <Main/>,
    children: [
      {
        path: "/trading/:symbol",
        element: <Trading/>,
      },
      {
        path: "/portfolio",
        element: <Portfolio/>,
      },
    ],
  },
  {
    element: <Auth/>,
    children: [
      {
        path: "/login",
        element: <Login/>,
      },
    ],
  },
]);

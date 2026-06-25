import { RouterProvider } from "react-router-dom";
import "./index.css";
import { routes } from "./app/routes";
import { Provider } from "./app/providers";

export function App() {
  return (
    <Provider>
      <RouterProvider router={routes}/>
    </Provider>
  );
}

export default App;

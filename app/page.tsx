import RecipeApp from "./components/RecipeApp";
import { ErrorBoundary } from "./components/ErrorBoundary";

export default function Home() {
  return <ErrorBoundary><RecipeApp /></ErrorBoundary>;
}

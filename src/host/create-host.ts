import { readMcpConfigurations, type Environment } from "./config.ts";
import { AssistenteHost } from "./host.ts";
import { RemoteMcpClient } from "./remote-client.ts";

export function createAssistenteHost(env: Environment): AssistenteHost {
  const configurations = readMcpConfigurations(env);
  return new AssistenteHost(
    configurations,
    (configuration) => new RemoteMcpClient(configuration),
  );
}

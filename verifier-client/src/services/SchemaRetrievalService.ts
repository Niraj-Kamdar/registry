import { BytesLike } from "ethers";
import { Web3ApiClient } from "@web3api/client-js";
import { VotingMachine } from "../typechain";

export class SchemaRetrievalService {
  private votingMachine: VotingMachine;
  private polywrapClient: Web3ApiClient;

  constructor(deps: {
    votingMachine: VotingMachine;
    polywrapClient: Web3ApiClient;
  }) {
    this.votingMachine = deps.votingMachine;
    this.polywrapClient = deps.polywrapClient;
  }

  getMinorVersionSchema = async (patchNodeId: BytesLike): Promise<string> => {
    const location = await this.votingMachine.getPrevPatchPackageLocation(
      patchNodeId
    );
    const minorVersionSchema = await this.polywrapClient.getSchema(location);
    return minorVersionSchema;
  };

  getPreviousAndNextVersionSchema = async (
    patchNodeId: BytesLike
  ): Promise<{
    prevMinorNodeId: BytesLike;
    prevSchema: string | undefined;
    nextMinorNodeId: BytesLike;
    nextSchema: string | undefined;
  }> => {
    const {
      prevMinorNodeId,
      prevPackageLocation,
      nextMinorNodeId,
      nextPackageLocation,
    } = await this.votingMachine.getPrevAndNextMinorPackageLocations(
      patchNodeId
    );

    const prevSchema = prevPackageLocation
      ? await this.polywrapClient.getSchema(prevPackageLocation)
      : undefined;

    const nextSchema = nextPackageLocation
      ? await this.polywrapClient.getSchema(nextPackageLocation)
      : undefined;

    return {
      prevMinorNodeId,
      prevSchema,
      nextMinorNodeId,
      nextSchema,
    };
  };
}

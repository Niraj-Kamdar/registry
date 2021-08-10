// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./version-events-listeners/IVersionDecidedListener.sol";
import "./version-events-listeners/IVersionVoteListener.sol";
import "./VerificationRootRelayer.sol";
import "./registry/VersionVerification.sol";

contract VerificationTreeManager is
  IVersionVoteListener,
  IVersionDecidedListener,
  OwnableUpgradeable
{
  event VerificationRootCalculated(
    bytes32 indexed verificationRoot,
    uint256 decidedVersionCount
  );

  event VersionVote(bytes32 indexed proposedVersionId, bool approved);

  event VersionDecided(
    bytes32 indexed proposedVersionId,
    bool verified,
    uint256 decidedVersionIndex
  );

  struct DynamicMerkleTree {
    //Track unpaired leaves and the highest level(root is at the top) to calculate the merkle root on the fly
    uint256 highestTreeLevel;
    mapping(uint256 => bytes32) unpairedTreeLeaves;
  }

  DynamicMerkleTree private verificationTree;

  address public verificationRootRelayer;
  address public registry;
  address public votingMachine;

  uint256 public decidedVersionCount;

  constructor() {
    initialize();
  }

  function initialize() public initializer {
    __Ownable_init();
  }

  function onVersionDecided(bytes32 proposedVersionId, bool verified)
    public
    override
  {
    assert(msg.sender == votingMachine);

    addVersionToTree(proposedVersionId, verified);

    emit VersionDecided(proposedVersionId, verified, decidedVersionCount);
    decidedVersionCount++;

    bytes32 verificationRoot = calculateMerkleRoot();
    emit VerificationRootCalculated(verificationRoot, decidedVersionCount);

    updateRegistryVerificationRoot(verificationRoot);
    relayVerificationRoot();
  }

  function onVersionVote(bytes32 proposedVersionId, bool approved)
    public
    override
  {
    assert(msg.sender == votingMachine);

    emit VersionVote(proposedVersionId, approved);
  }

  function updateRegistryVerificationRoot(bytes32 verificationRoot) private {
    if (registry != address(0)) {
      VersionVerification(registry).updateVerificationRoot(verificationRoot);
    }
  }

  function relayVerificationRoot() private {
    if (verificationRootRelayer != address(0)) {
      VerificationRootRelayer(verificationRootRelayer).relayVerificationRoot();
    }
  }

  function addVersionToTree(bytes32 proposedVersionId, bool verified) private {
    //Hash the version ID with the "verified" variable to store that the version is approved or not
    bytes32 leaf = keccak256(abi.encodePacked(proposedVersionId, verified));

    //Go through the unpaired tree leaves and pair them with the new leaf
    uint256 currentTreeLevel = 0;
    while (verificationTree.unpairedTreeLeaves[currentTreeLevel] != 0x0) {
      leaf = keccak256(
        abi.encodePacked(
          verificationTree.unpairedTreeLeaves[currentTreeLevel],
          leaf
        )
      );

      currentTreeLevel++;
    }

    //Store the unpaired leaf to be paired later
    verificationTree.unpairedTreeLeaves[currentTreeLevel] = leaf;

    //Track the highest level
    if (currentTreeLevel > verificationTree.highestTreeLevel) {
      verificationTree.highestTreeLevel = currentTreeLevel;
    }
  }

  function calculateMerkleRoot() private view returns (bytes32) {
    bytes32 leaf = 0;

    //Go through the unpaired tree leaves and pair them with the "0" leaf
    //If there is no unpaired leaf, just propagate the current one upwards
    uint256 currentTreeLevel = 0;
    while (currentTreeLevel < verificationTree.highestTreeLevel) {
      if (verificationTree.unpairedTreeLeaves[currentTreeLevel] != 0x0) {
        leaf = keccak256(
          abi.encodePacked(
            verificationTree.unpairedTreeLeaves[currentTreeLevel],
            leaf
          )
        );
      }

      currentTreeLevel++;
    }

    bytes32 root;

    if (leaf != 0) {
      //The tree was unbalanced
      root = keccak256(
        abi.encodePacked(
          verificationTree.unpairedTreeLeaves[currentTreeLevel],
          leaf
        )
      );
    } else {
      //The tree was balanced and the highest unpaired leaf was already the root
      root = verificationTree.unpairedTreeLeaves[currentTreeLevel];
    }

    return root;
  }
}

// Generated from MeraPortfolio.sol.
export const meraAbi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "accountCore_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "quote_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "markets_",
        "type": "address[3]",
        "internalType": "address[3]"
      },
      {
        "name": "legacy_",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "PLAN_TYPEHASH",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "TRADE_TYPEHASH",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "baseUnits",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "configureMeraPolicy",
    "inputs": [
      {
        "name": "id",
        "type": "uint40",
        "internalType": "uint40"
      },
      {
        "name": "c",
        "type": "tuple",
        "internalType": "struct MeraPortfolio.Config",
        "components": [
          {
            "name": "manager",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "expiry",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "buyCap",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "sellCap",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "tradeCap",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "references",
            "type": "uint128[3]",
            "internalType": "uint128[3]"
          },
          {
            "name": "floors",
            "type": "uint128[3]",
            "internalType": "uint128[3]"
          },
          {
            "name": "ceilings",
            "type": "uint128[3]",
            "internalType": "uint128[3]"
          }
        ]
      },
      {
        "name": "signer",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "core",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IAccount"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "eip712Domain",
    "inputs": [],
    "outputs": [
      {
        "name": "fields",
        "type": "bytes1",
        "internalType": "bytes1"
      },
      {
        "name": "name",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "version",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "chainId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "verifyingContract",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "salt",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "extensions",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "executeFor",
    "inputs": [
      {
        "name": "p",
        "type": "tuple",
        "internalType": "struct MeraPortfolio.Plan",
        "components": [
          {
            "name": "accountId",
            "type": "uint40",
            "internalType": "uint40"
          },
          {
            "name": "version",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "authNonce",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "nonce",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "deadline",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "trades",
            "type": "tuple[]",
            "internalType": "struct MeraPortfolio.Trade[]",
            "components": [
              {
                "name": "marketIndex",
                "type": "uint8",
                "internalType": "uint8"
              },
              {
                "name": "isBuy",
                "type": "bool",
                "internalType": "bool"
              },
              {
                "name": "amountIn",
                "type": "uint128",
                "internalType": "uint128"
              },
              {
                "name": "minAmountOut",
                "type": "uint128",
                "internalType": "uint128"
              }
            ]
          }
        ]
      },
      {
        "name": "signature",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "executeRebalance",
    "inputs": [
      {
        "name": "p",
        "type": "tuple",
        "internalType": "struct MeraPortfolio.Plan",
        "components": [
          {
            "name": "accountId",
            "type": "uint40",
            "internalType": "uint40"
          },
          {
            "name": "version",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "authNonce",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "nonce",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "deadline",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "trades",
            "type": "tuple[]",
            "internalType": "struct MeraPortfolio.Trade[]",
            "components": [
              {
                "name": "marketIndex",
                "type": "uint8",
                "internalType": "uint8"
              },
              {
                "name": "isBuy",
                "type": "bool",
                "internalType": "bool"
              },
              {
                "name": "amountIn",
                "type": "uint128",
                "internalType": "uint128"
              },
              {
                "name": "minAmountOut",
                "type": "uint128",
                "internalType": "uint128"
              }
            ]
          }
        ]
      },
      {
        "name": "signature",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getPolicy",
    "inputs": [
      {
        "name": "id",
        "type": "uint40",
        "internalType": "uint40"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct MeraPortfolio.Policy",
        "components": [
          {
            "name": "config",
            "type": "tuple",
            "internalType": "struct MeraPortfolio.Config",
            "components": [
              {
                "name": "manager",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "expiry",
                "type": "uint64",
                "internalType": "uint64"
              },
              {
                "name": "buyCap",
                "type": "uint128",
                "internalType": "uint128"
              },
              {
                "name": "sellCap",
                "type": "uint128",
                "internalType": "uint128"
              },
              {
                "name": "tradeCap",
                "type": "uint128",
                "internalType": "uint128"
              },
              {
                "name": "references",
                "type": "uint128[3]",
                "internalType": "uint128[3]"
              },
              {
                "name": "floors",
                "type": "uint128[3]",
                "internalType": "uint128[3]"
              },
              {
                "name": "ceilings",
                "type": "uint128[3]",
                "internalType": "uint128[3]"
              }
            ]
          },
          {
            "name": "version",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "paused",
            "type": "bool",
            "internalType": "bool"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getUsage",
    "inputs": [
      {
        "name": "id",
        "type": "uint40",
        "internalType": "uint40"
      }
    ],
    "outputs": [
      {
        "name": "u",
        "type": "tuple",
        "internalType": "struct MeraPortfolio.Usage",
        "components": [
          {
            "name": "day",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "bought",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "sold",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "references",
            "type": "uint128[3]",
            "internalType": "uint128[3]"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "hashPlan",
    "inputs": [
      {
        "name": "p",
        "type": "tuple",
        "internalType": "struct MeraPortfolio.Plan",
        "components": [
          {
            "name": "accountId",
            "type": "uint40",
            "internalType": "uint40"
          },
          {
            "name": "version",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "authNonce",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "nonce",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "deadline",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "trades",
            "type": "tuple[]",
            "internalType": "struct MeraPortfolio.Trade[]",
            "components": [
              {
                "name": "marketIndex",
                "type": "uint8",
                "internalType": "uint8"
              },
              {
                "name": "isBuy",
                "type": "bool",
                "internalType": "bool"
              },
              {
                "name": "amountIn",
                "type": "uint128",
                "internalType": "uint128"
              },
              {
                "name": "minAmountOut",
                "type": "uint128",
                "internalType": "uint128"
              }
            ]
          }
        ]
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "implementation",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "legacy",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract MeraPortfolio"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "markets",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "nonces",
    "inputs": [
      {
        "name": "",
        "type": "uint40",
        "internalType": "uint40"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "pausePolicy",
    "inputs": [
      {
        "name": "id",
        "type": "uint40",
        "internalType": "uint40"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "quoteToken",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "signerForAccount",
    "inputs": [
      {
        "name": "",
        "type": "uint40",
        "internalType": "uint40"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "swapLeg",
    "inputs": [
      {
        "name": "id",
        "type": "uint40",
        "internalType": "uint40"
      },
      {
        "name": "market",
        "type": "uint8",
        "internalType": "uint8"
      },
      {
        "name": "buy",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "amount",
        "type": "uint128",
        "internalType": "uint128"
      },
      {
        "name": "minimum",
        "type": "uint128",
        "internalType": "uint128"
      },
      {
        "name": "deadline",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct IBook.SwapResult",
        "components": [
          {
            "name": "amountInUsed",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "amountOut",
            "type": "uint128",
            "internalType": "uint128"
          }
        ]
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "EIP712DomainChanged",
    "inputs": [],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "MeraConfigured",
    "inputs": [
      {
        "name": "accountId",
        "type": "uint40",
        "indexed": true,
        "internalType": "uint40"
      },
      {
        "name": "signer",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PolicyConfigured",
    "inputs": [
      {
        "name": "accountId",
        "type": "uint40",
        "indexed": true,
        "internalType": "uint40"
      },
      {
        "name": "version",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "manager",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "expiry",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PolicyPaused",
    "inputs": [
      {
        "name": "accountId",
        "type": "uint40",
        "indexed": true,
        "internalType": "uint40"
      },
      {
        "name": "version",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RebalanceExecuted",
    "inputs": [
      {
        "name": "accountId",
        "type": "uint40",
        "indexed": true,
        "internalType": "uint40"
      },
      {
        "name": "nonce",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "digest",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "TradeExecuted",
    "inputs": [
      {
        "name": "accountId",
        "type": "uint40",
        "indexed": true,
        "internalType": "uint40"
      },
      {
        "name": "nonce",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "marketIndex",
        "type": "uint8",
        "indexed": false,
        "internalType": "uint8"
      },
      {
        "name": "isBuy",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      },
      {
        "name": "amountInUsed",
        "type": "uint128",
        "indexed": false,
        "internalType": "uint128"
      },
      {
        "name": "amountOut",
        "type": "uint128",
        "indexed": false,
        "internalType": "uint128"
      },
      {
        "name": "charged",
        "type": "uint128",
        "indexed": false,
        "internalType": "uint128"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "BudgetExceeded",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ECDSAInvalidSignature",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ECDSAInvalidSignatureLength",
    "inputs": [
      {
        "name": "length",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ECDSAInvalidSignatureS",
    "inputs": [
      {
        "name": "s",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "EmptyFill",
    "inputs": []
  },
  {
    "type": "error",
    "name": "Inactive",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidConfig",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidPlan",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidShortString",
    "inputs": []
  },
  {
    "type": "error",
    "name": "PriceOutsideBand",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ReentrancyGuardReentrantCall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "StringTooLong",
    "inputs": [
      {
        "name": "str",
        "type": "string",
        "internalType": "string"
      }
    ]
  },
  {
    "type": "error",
    "name": "Unauthorized",
    "inputs": []
  }
] as const;

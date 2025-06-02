// Direct on-chain testing script for Anchor-based NFT program
import {
    Connection,
    PublicKey,
    Keypair,
    SystemProgram,
    SYSVAR_RENT_PUBKEY,
    Transaction,
    TransactionInstruction,
    sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    getAssociatedTokenAddress,
} from "@solana/spl-token";
import * as borsh from "borsh";
import { createHash } from "crypto";
import bs58 from "bs58";

// Your deployed program ID
const PROGRAM_ID = new PublicKey("6WaHa4SbXsbTr1umnWBGpsYTh7btxLFn3DcE2m8ExhhC");
const METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

// Function to calculate Anchor instruction discriminator
function getInstructionDiscriminator(instructionName) {
    const hash = createHash('sha256');
    hash.update(`global:${instructionName}`);
    return hash.digest().slice(0, 8);
}

// Define instruction data structure for Anchor
class MintNFTArgs {
    constructor(name, symbol, uri) {
        this.name = name;
        this.symbol = symbol;
        this.uri = uri;
    }
}

// Borsh schema for serialization (without discriminator, we'll add it separately)
const MintNFTSchema = new Map([
    [
        MintNFTArgs,
        {
            kind: 'struct',
            fields: [
                ['name', 'string'],
                ['symbol', 'string'],
                ['uri', 'string'],
            ],
        },
    ],
]);

async function testDeployedContract() {
    // Connect to devnet
    const connection = new Connection("https://api.devnet.solana.com", "confirmed");

    // REPLACE THIS WITH YOUR SOLANA PLAYGROUND WALLET
    // Method 1: Use base58 private key from Solana Playground
    // const privateKeyBase58 = "your_base58_private_key_from_solana_playground";
    // const payer = Keypair.fromSecretKey(bs58.decode(privateKeyBase58));

    // Method 2: Use array format (64 numbers)
    const payer = Keypair.fromSecretKey(Uint8Array.from(["private key here"]));

    // Method 3: Load from file (if you exported to file)
    // import fs from 'fs';
    // const secretKey = JSON.parse(fs.readFileSync('/path/to/your/keypair.json', 'utf8'));
    // const payer = Keypair.fromSecretKey(Uint8Array.from(secretKey));

    // Method 4: For testing only - generates new wallet each time
    //const payer = Keypair.generate();

    console.log("Payer public key:", payer.publicKey.toString());
    console.log("🔑 Save this private key if you want to reuse this wallet:");
    console.log("Private key array:", Array.from(payer.secretKey));

    // Request airdrop for testing
    try {
        console.log("Requesting airdrop...");
        const signature = await connection.requestAirdrop(
            payer.publicKey,
            2 * 1000000000 // 2 SOL
        );
        await connection.confirmTransaction(signature);
        console.log("Airdrop successful!");
    } catch (error) {
        console.log("Airdrop failed or already funded:", error.message);
    }

    // Check balance
    const balance = await connection.getBalance(payer.publicKey);
    console.log("Wallet balance:", balance / 1000000000, "SOL");

    if (balance < 1000000000) { // Less than 1 SOL
        console.error("❌ Insufficient balance. Need at least 1 SOL for transaction fees.");
        return;
    }

    // Generate new mint keypair
    const mintKeypair = Keypair.generate();
    console.log("Mint address:", mintKeypair.publicKey.toString());

    // Get associated token account
    const associatedTokenAccount = await getAssociatedTokenAddress(
        mintKeypair.publicKey,
        payer.publicKey
    );

    // Derive PDAs
    const [metadataAccount] = PublicKey.findProgramAddressSync(
        [
            Buffer.from("metadata"),
            METADATA_PROGRAM_ID.toBuffer(),
            mintKeypair.publicKey.toBuffer(),
        ],
        METADATA_PROGRAM_ID
    );

    const [masterEditionAccount] = PublicKey.findProgramAddressSync(
        [
            Buffer.from("metadata"),
            METADATA_PROGRAM_ID.toBuffer(),
            mintKeypair.publicKey.toBuffer(),
            Buffer.from("edition"),
        ],
        METADATA_PROGRAM_ID
    );

    // Create instruction data
    const instructionData = new MintNFTArgs(
        "My Test NFT",
        "TESTNFT",
        "https://arweave.net/test-metadata-uri"
    );

    // Serialize instruction data
    const serializedData = borsh.serialize(MintNFTSchema, instructionData);

    // Get Anchor discriminator (try common instruction names)
    const possibleInstructionNames = [
        'mint_nft',
        'mintNft',
        'create_nft',
        'createNft',
        'mint',
        'initialize'
    ];

    console.log("\n🔍 Trying different instruction discriminators...");

    for (const instructionName of possibleInstructionNames) {
        try {
            console.log(`\nTrying instruction: "${instructionName}"`);

            const discriminator = getInstructionDiscriminator(instructionName);
            console.log(`Discriminator: [${Array.from(discriminator).join(', ')}]`);

            // Combine discriminator with serialized data
            const finalInstructionData = Buffer.concat([discriminator, Buffer.from(serializedData)]);

            // Create accounts array
            const keys = [
                { pubkey: payer.publicKey, isSigner: true, isWritable: true },
                { pubkey: mintKeypair.publicKey, isSigner: true, isWritable: true },
                { pubkey: associatedTokenAccount, isSigner: false, isWritable: true },
                { pubkey: metadataAccount, isSigner: false, isWritable: true },
                { pubkey: masterEditionAccount, isSigner: false, isWritable: true },
                { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
                { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
                { pubkey: METADATA_PROGRAM_ID, isSigner: false, isWritable: false },
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
                { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
            ];

            // Create instruction
            const instruction = new TransactionInstruction({
                keys,
                programId: PROGRAM_ID,
                data: finalInstructionData,
            });

            // Create and send transaction
            const transaction = new Transaction().add(instruction);

            console.log(`Sending transaction with "${instructionName}" instruction...`);
            const signature = await sendAndConfirmTransaction(
                connection,
                transaction,
                [payer, mintKeypair],
                {
                    commitment: "confirmed",
                    preflightCommitment: "confirmed",
                }
            );

            console.log("✅ NFT minted successfully!");
            console.log("Transaction signature:", signature);
            console.log("View on explorer:", `https://explorer.solana.com/tx/${signature}?cluster=devnet`);

            // Verify the mint
            const mintInfo = await connection.getAccountInfo(mintKeypair.publicKey);
            if (mintInfo) {
                console.log("✅ Mint account created successfully");
            }

            // Check token account
            const tokenAccounts = await connection.getTokenAccountsByOwner(
                payer.publicKey,
                { mint: mintKeypair.publicKey }
            );

            if (tokenAccounts.value.length > 0) {
                console.log("✅ Token account found with NFT");
            }

            return; // Success! Exit the function

        } catch (error) {
            console.error(`❌ Failed with "${instructionName}":`, error.message);
            if (error.logs) {
                console.error("Program logs:", error.logs.slice(-3)); // Show last 3 logs
            }

            // If this was the last attempt, show full error
            if (instructionName === possibleInstructionNames[possibleInstructionNames.length - 1]) {
                console.error("\n❌ All instruction names failed. Full error details:");
                console.error(error);

                console.log("\n🔍 Debug Information:");
                console.log("Program ID:", PROGRAM_ID.toString());
                console.log("Instruction data length:", finalInstructionData.length);
                console.log("Number of accounts:", keys.length);

                console.log("\n💡 Possible solutions:");
                console.log("1. Check if your program uses a different instruction name");
                console.log("2. Verify the program ID is correct");
                console.log("3. Check if the account layout matches your program");
                console.log("4. Look at your program's IDL file for the correct instruction name");
            }
        }
    }
}

// Run the test
testDeployedContract()
    .then(() => console.log("\nTest completed"))
    .catch(console.error);

const { ethers } = require('ethers');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
require("dotenv").config();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const privateKey = process.env.CERT_PRIVATE_KEY;
const wallet = new ethers.Wallet(privateKey);
const publicKey = wallet.publicKey;

const inputFile = 'all_chips.txt';
const outputFile = 'hashed_signed_chips.csv';

fs.readFile(inputFile, 'utf8', async (err, data) => {
    if (err) {
        console.error(err);
        return;
    }

    const rows = data.split('\n');
    let outputData = '';

    for (let row of rows) {
        if (!row.trim()) continue; // Skip empty rows

        // Assuming row contains the uncompressed public key
        // Compute Ethereum address from uncompressed public key
        let address;
        try {
            address = ethers.utils.computeAddress("0x" + row.trim());
        } catch (error) {
            console.error(`Error computing address for row: ${row}`, error);
            continue; // Skip this row if there's an error
        }

        // Hash the Ethereum address
        const addressHash = ethers.utils.keccak256(address);

        // Sign the hash of the Ethereum address
        const signature = await wallet.signMessage(ethers.utils.arrayify(addressHash));

        // Store in Supabase
        const { data: supabaseData, error } = await supabase
            .from('certs')
            .insert([{ chipHash: addressHash, chipCert: signature }]);
            console.log(`Adding ${address} to Supabase`)

        if (error) {
            console.error('Error inserting to Supabase:', error);
        } else {
            // Append to output file content
            outputData += `${address},${addressHash},${signature}\n`;
        }
    }

    // Export the file with the results
    fs.writeFile(outputFile, outputData, 'utf8', (err) => {
        if (err) {
            console.error(err);
        } else {
            console.log('Output file saved.');
        }
    });
});
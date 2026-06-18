/**
 * Quick API test: generates a token using a real user and calls /api/approver/items
 * to verify if impAtrbt2 is returned in the response.
 */
import * as jwt from 'jsonwebtoken';
import * as http from 'http';
import { PrismaClient } from '../src/generated/prisma';

const JWT_SECRET = 'your-super-secret-jwt-key-change-in-production-2025';
const PORT = 5001;
const prisma = new PrismaClient();

function apiGet(path: string, token: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: '127.0.0.1',
            port: PORT,
            path,
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        };
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch { resolve(data); }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

async function main() {
    // Get a real admin user from DB
    const adminUser = await prisma.user.findFirst({
        where: { role: 'ADMIN', isActive: true },
        select: { id: true, email: true, role: true, division: true, subDivision: true }
    });

    if (!adminUser) {
        console.log('No admin user found in DB');
        return;
    }
    console.log(`Using user: ${adminUser.email} (${adminUser.role})`);

    const token = jwt.sign(
        { id: adminUser.id, email: adminUser.email, role: adminUser.role, division: adminUser.division, subDivision: adminUser.subDivision },
        JWT_SECRET,
        { expiresIn: '1h' }
    );

    console.log('Calling /api/approver/items?search=HF-2610&limit=5 ...');
    const result = await apiGet('/api/approver/items?search=HF-2610&limit=5', token);

    if (result.data && result.data.length > 0) {
        const item = result.data[0];
        console.log(`\nItem found: designNumber=${item.designNumber} articleNumber=${item.articleNumber}`);
        console.log(`impAtrbt2 in response: "${item.impAtrbt2}"`);
        console.log(`impAtrbt2 key exists: ${'impAtrbt2' in item}`);

        if (!('impAtrbt2' in item)) {
            console.log('\n❌ PROBLEM: impAtrbt2 key is MISSING from API response!');
            console.log('   → Backend getItems select does NOT include impAtrbt2');
            console.log('   → Backend needs to be restarted with the latest code');
        } else if (item.impAtrbt2 === null) {
            console.log('\n⚠️  impAtrbt2 is null in API response');
        } else {
            console.log(`\n✅ impAtrbt2 = "${item.impAtrbt2}" returned correctly by API!`);
        }
    } else {
        console.log('No items found for HF-2610');
        console.log('Error:', JSON.stringify(result).slice(0, 300));
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());

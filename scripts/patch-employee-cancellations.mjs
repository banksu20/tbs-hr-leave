// Apply after 011_employee_cancellation.sql through an n8n PostgreSQL node.
export function patchEmployeeCancellations(original) {
 const w=structuredClone(original);
 const template=w.nodes.find(n=>n.name==='Webhook dashboard-leave-delete');
 const db=w.nodes.find(n=>n.name==='dashboard-leave-delete');
 if(!template?.credentials?.httpHeaderAuth||!db?.credentials?.postgres)throw new Error('Existing authenticated dashboard webhook and PostgreSQL credentials are required');
 const nodes=[
  {
    "name": "Webhook employee-cancellations",
    "type": "n8n-nodes-base.webhook",
    "typeVersion": 2.1,
    "position": [
      -640,
      3160
    ],
    "parameters": {
      "httpMethod": "POST",
      "path": "employee-cancellations",
      "authentication": "headerAuth",
      "responseMode": "responseNode",
      "options": {}
    }
  },
  {
    "name": "Employee cancellations",
    "type": "n8n-nodes-base.postgres",
    "typeVersion": 2.7,
    "position": [
      -400,
      3160
    ],
    "parameters": {
      "operation": "executeQuery",
      "query": "SELECT tbs_cancellation($1::text,$2::jsonb) AS result;",
      "options": {
        "queryReplacement": "={{ [$json.body.operation, JSON.stringify($json.body.payload || {})] }}"
      }
    }
  },
  {
    "name": "Respond employee-cancellations",
    "type": "n8n-nodes-base.respondToWebhook",
    "typeVersion": 1.5,
    "position": [
      -160,
      3160
    ],
    "parameters": {
      "respondWith": "json",
      "responseBody": "={{ $json.result }}",
      "options": {
        "responseHeaders": {
          "entries": [
            {
              "name": "Cache-Control",
              "value": "no-store"
            }
          ]
        }
      }
    }
  }
];
 nodes[0].credentials=template.credentials;nodes[1].credentials=db.credentials;
 for(const node of nodes){const old=w.nodes.find(n=>n.name===node.name);if(old)Object.assign(old,node);else w.nodes.push({...node,id:'employee-cancellation-'+w.nodes.length});}
 for(let i=0;i<2;i++)w.connections[nodes[i].name]={main:[[{node:nodes[i+1].name,type:'main',index:0}]]};
 return w;
}


const express = require('express');
const router = express.Router();
const pool = require('../db/database').pool || require('../db/database');
const { authMiddleware } = require('../middleware/auth');
router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const { from, to, status, limit=50 } = req.query;
    const params=[]; let i=0;
    let q=`SELECT s.*,c.name as customer_name,c.instagram as customer_ig,u.name as seller_name FROM sales s LEFT JOIN customers c ON s.customer_id=c.id LEFT JOIN users u ON s.user_id=u.id WHERE 1=1`;
    if (from) { q+=` AND DATE(s.created_at)>=$${++i}`; params.push(from); }
    if (to)   { q+=` AND DATE(s.created_at)<=$${++i}`; params.push(to); }
    if (status){ q+=` AND s.payment_status=$${++i}`;   params.push(status); }
    q+=` ORDER BY s.created_at DESC LIMIT $${++i}`; params.push(parseInt(limit));
    const { rows: sales } = await pool.query(q, params);
    for (const s of sales) {
      const { rows: items } = await pool.query('SELECT * FROM sale_items WHERE sale_id=$1',[s.id]);
      s.items = items;
    }
    res.json(sales);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT s.*,c.name as customer_name,c.phone as customer_phone,c.instagram as customer_ig,u.name as seller_name FROM sales s LEFT JOIN customers c ON s.customer_id=c.id LEFT JOIN users u ON s.user_id=u.id WHERE s.id=$1`,[req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Venta no encontrada' });
    const { rows: items } = await pool.query('SELECT * FROM sale_items WHERE sale_id=$1',[rows[0].id]);
    rows[0].items = items;
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    const { customer_id, items, discount, payment_method, amount_paid, notes } = req.body;
    if (!items||items.length===0) return res.status(400).json({ error: 'Se requiere al menos un producto' });
    for (const item of items) {
      if (item.product_id) {
        const { rows } = await client.query('SELECT stock,name FROM products WHERE id=$1',[item.product_id]);
        if (!rows[0]) return res.status(400).json({ error: 'Producto no encontrado' });
        if (rows[0].stock<item.quantity) return res.status(400).json({ error: 'Stock insuficiente para: '+rows[0].name });
      }
    }
    const subtotal = items.reduce((s,i)=>s+(i.unit_price*i.quantity),0);
    const total = Math.max(0, subtotal-(parseFloat(discount)||0));
    const paid = amount_paid!==undefined?parseFloat(amount_paid):total;
    const balance = Math.max(0,total-paid);
    const status = balance>0?'partial':'paid';
    await client.query('BEGIN');
    const { rows: sr } = await client.query(`INSERT INTO sales (customer_id,user_id,subtotal,discount,total,payment_method,payment_status,amount_paid,balance,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [customer_id||null, req.user.id, subtotal, parseFloat(discount)||0, total, payment_method||'cash', status, paid, balance, notes||'']);
    const saleId = sr[0].id;
    for (const item of items) {
      let pname=item.product_name||'Producto libre', cost=item.cost_price||0;
      if (item.product_id) {
        const { rows: pr } = await client.query('SELECT name,cost_price FROM products WHERE id=$1',[item.product_id]);
        if (pr[0]) { pname=item.product_name||pr[0].name; cost=item.cost_price||pr[0].cost_price||0; }
      }
      await client.query('INSERT INTO sale_items (sale_id,product_id,product_name,quantity,unit_price,cost_price,discount) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [saleId, item.product_id||null, pname, item.quantity, item.unit_price, cost, item.discount||0]);
      if (item.product_id) {
        const { rows: pr } = await client.query('SELECT stock,min_stock,name FROM products WHERE id=$1',[item.product_id]);
        if (pr[0]) {
          const ns=pr[0].stock-item.quantity;
          const st=ns===0?'out_of_stock':ns<=pr[0].min_stock?'low_stock':'available';
          await client.query('UPDATE products SET stock=$1,status=$2 WHERE id=$3',[ns,st,item.product_id]);
          await client.query('INSERT INTO stock_movements (product_id,type,quantity,reference_id,notes) VALUES ($1,$2,$3,$4,$5)',
            [item.product_id,'sale',-item.quantity,saleId,'Venta #'+saleId]);
          if (ns<=pr[0].min_stock&&ns>0) await client.query('INSERT INTO notifications (type,title,message,link) VALUES ($1,$2,$3,$4)',['warning','Stock bajo: '+pr[0].name,'Solo '+ns+' unidades restantes','/inventory']);
          if (ns===0) await client.query('INSERT INTO notifications (type,title,message,link) VALUES ($1,$2,$3,$4)',['danger','Agotado: '+pr[0].name,'Producto sin stock','/inventory']);
        }
      }
    }
    if (customer_id) await client.query('UPDATE customers SET total_spent=total_spent+$1,purchase_count=purchase_count+1,last_purchase=NOW() WHERE id=$2',[total,customer_id]);
    await client.query('INSERT INTO notifications (type,title,message,link) VALUES ($1,$2,$3,$4)',['success','Nueva venta: $'+total.toFixed(2),'Venta #'+saleId+' registrada','/sales']);
    await client.query('COMMIT');
    res.status(201).json({ id: saleId, message: 'Venta registrada exitosamente' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

router.delete('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { rows: sr } = await client.query('SELECT * FROM sales WHERE id=$1',[req.params.id]);
    if (!sr[0]) return res.status(404).json({ error: 'Venta no encontrada' });
    const sale = sr[0];
    const { rows: items } = await client.query('SELECT * FROM sale_items WHERE sale_id=$1',[sale.id]);
    await client.query('BEGIN');
    for (const item of items) {
      if (!item.product_id) continue;
      const { rows: pr } = await client.query('SELECT stock,min_stock FROM products WHERE id=$1',[item.product_id]);
      if (!pr[0]) continue;
      const ns=pr[0].stock+item.quantity;
      const st=ns===0?'out_of_stock':ns<=pr[0].min_stock?'low_stock':'available';
      await client.query('UPDATE products SET stock=$1,status=$2 WHERE id=$3',[ns,st,item.product_id]);
      await client.query('INSERT INTO stock_movements (product_id,type,quantity,reference_id,notes) VALUES ($1,$2,$3,$4,$5)',
        [item.product_id,'adjustment',item.quantity,sale.id,'Anulacion venta #'+sale.id]);
    }
    if (sale.customer_id) await client.query('UPDATE customers SET total_spent=GREATEST(0,total_spent-$1),purchase_count=GREATEST(0,purchase_count-1) WHERE id=$2',[sale.total,sale.customer_id]);
    await client.query('DELETE FROM sales WHERE id=$1',[sale.id]);
    await client.query('INSERT INTO notifications (type,title,message,link) VALUES ($1,$2,$3,$4)',['info','Venta #'+sale.id+' anulada','Stock restaurado','/sales']);
    await client.query('COMMIT');
    res.json({ message: 'Venta #'+sale.id+' anulada y stock restaurado' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

router.put('/:id/payment', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM sales WHERE id=$1',[req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Venta no encontrada' });
    const sale=rows[0];
    const newPaid=parseFloat(sale.amount_paid)+parseFloat(req.body.amount);
    const newBalance=Math.max(0,sale.total-newPaid);
    const status=newBalance===0?'paid':'partial';
    await pool.query('UPDATE sales SET amount_paid=$1,balance=$2,payment_status=$3 WHERE id=$4',[newPaid,newBalance,status,sale.id]);
    res.json({ amount_paid:newPaid, balance:newBalance, status });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

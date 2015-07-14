// Test balancing all chunks off of one shard
var s = new ShardingTest("balance_tags1", 3, 1, 1, { sync:true, chunksize : 1, nopreallocj : true });
s.config.settings.update({ _id: "balancer" }, { $set: { stopped: false }}, true);

s.adminCommand({ enablesharding: "test" });
s.ensurePrimaryShard('test', 'shard0001');

var db = s.getDB("test");

var bulk = db.foo.initializeUnorderedBulkOp();
for (i = 0; i < 21; i++) {
    bulk.insert({ _id: i, x: i });
}
assert.writeOK(bulk.execute());

sh.shardCollection("test.foo", { _id : 1 });

sh.stopBalancer();

for (i = 0; i < 20; i++) {
    s.adminCommand({ split : "test.foo", middle : { _id : i } });
}

sh.startBalancer();

sh.status(true);

// Wait for the initial balance to happen
assert.soon(function() {
                var counts = s.chunkCounts("foo");
                printjson(counts);
                return counts["shard0000"] == 7 &&
                       counts["shard0001"] == 7 &&
                       counts["shard0002"] == 7;
            },
            "balance 1 didn't happen",
            1000 * 60 * 10,
            1000);

// Quick test of some shell helpers and setting up state
sh.addShardTag("shard0000", "a");
assert.eq([ "a" ] , s.config.shards.findOne({ _id : "shard0000" }).tags);

sh.addShardTag("shard0000", "b");
assert.eq([ "a" , "b" ], s.config.shards.findOne({ _id : "shard0000" }).tags);

sh.removeShardTag("shard0000", "b");
assert.eq([ "a" ], s.config.shards.findOne( { _id : "shard0000" } ).tags);

sh.addShardTag("shard0001" , "a");
sh.addTagRange("test.foo" , { _id : -1 } , { _id : 1000 } , "a");

sh.status( true );

// At this point, everything should drain off shard 2, which does not have the tag
assert.soon(function() {
                var counts = s.chunkCounts("foo");
                printjson(counts);
                return counts["shard0002"] == 0;
            },
            "balance 2 didn't happen",
            1000 * 60 * 10 , 1000);

printjson(sh.status());

s.stop();
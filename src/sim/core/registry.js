/* ═══════════════════════════════════════════════════════════════════
   LAB REGISTRY
   ───────────────────────────────────────────────────────────────────
   প্রতিটি lab নিজেকে NetLab.labs-এ যোগ করে। এই file সব lab file-এর
   আগে load হতে হবে, তাই build order-এ এটি প্রথমে।
   ═══════════════════════════════════════════════════════════════════ */
(function(NS){
"use strict";
NS.labs = NS.labs || {};

/* Sidebar-এ lab গুলো এই ক্রমে দেখাবে */
NS.LAB_ORDER = ['packet','encap','ethernet','switching','arp'];

NS.labList = function(){
  var out = [];
  for(var i = 0; i < NS.LAB_ORDER.length; i++){
    var l = NS.labs[NS.LAB_ORDER[i]];
    if(l) out.push(l);
  }
  return out;
};

})(window.NetLab = window.NetLab || {});

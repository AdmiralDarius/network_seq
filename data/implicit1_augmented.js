var S$ = require('S$');

var con_ucon_x_0 = S$.symbol('con_ucon_x_0',true);


var con_con_y_1 = S$.symbol('con_con_y_1',true);


var con_con_y_2 = S$.symbol('con_con_y_2',true);


var ucon_x = S$.symbol('ucon_x',[true, "1234", "random"]);


var con_y = S$.symbol('con_y',[true, "1234", "random"]);


/* VARS */
if (con_ucon_x_0){ 
 ucon_x  = (Math.random() < 0.5)
 
}
if (con_con_y_1){ 
 con_y   = (Math.random() < 0.5)
 
}
/* MAIN JS PROGRAM */
if (ucon_x){
  if (con_con_y_2){ 
   con_y = false
 
  }
}
/// END OF FILE ///
